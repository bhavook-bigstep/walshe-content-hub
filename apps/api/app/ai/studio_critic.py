"""Independent visual critic + bounded fix loop for the Studio Builder (AC103a-d).

An OUTER orchestration around ``run_studio_graph`` (that module is not edited):

    build -> render + critique (round 1) -> feed P1 findings back -> Builder fixes
          -> re-render + re-critique (round 2, re-verifying each prior finding) -> stop

Independence (AC103a): the critic sees ONLY the rendered image(s) and the fixed ``CHECKLIST`` --
never the brief, the build transcript or the design JSON. It reaches the injected ``CritiqueFn``
through the third argument (``broken_images`` slot) as tagged dicts, so the existing alias is
reused:
``{"kind": "checklist", "items": [...]}``, plus ``{"kind": "verify", "findings": [...]}`` from
round 2, then any broken-image records from the render.

Bounded (AC103b): at most ``MAX_ROUNDS`` critique rounds; P1 (broken) + P2 (should-fix) drive a
fix, P3 is polish and left alone. Round 2
re-verifies each prior finding as fixed / partly / not (AC103c). Deterministic given deterministic
injected fns (Contract 4): no clock, randomness or I/O here.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.ai.studio_agent import (
    AgentItem,
    ApplyFn,
    CritiqueFn,
    GenerateImageFn,
    ObserveFn,
    RenderFn,
    StudioAgentResult,
)
from app.ai.studio_graph import run_studio_graph
from app.config import Settings
from app.observability.tracing import trace_span

logger = logging.getLogger("app.ai.studio_critic")

MAX_ROUNDS = 2
SEVERITIES = ("P1", "P2", "P3")
FIX_OPS = ("move-node", "style-node", "edit-text")
VERIFY_STATUSES = ("fixed", "partly", "not")

# Fixed checklist: the critic judges ONLY against this, never against the brief.
CHECKLIST: tuple[str, ...] = (
    "All text is fully inside the canvas and not clipped or overlapping other text.",
    "Text has sufficient contrast against what is behind it and is legible at phone size.",
    "No image is broken, blank, stretched or distorted.",
    "Elements are aligned and spaced consistently; nothing collides unintentionally.",
    "There is a clear visual hierarchy: one obvious headline, supporting copy secondary.",
    "Nothing important sits outside the safe margins or is hidden behind another element.",
)

BuildFn = Callable[..., StudioAgentResult]


@dataclass
class RoundReport:
    round: int
    findings: list[dict[str, Any]]
    verifications: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class CriticLoopResult:
    result: StudioAgentResult
    rounds: list[RoundReport] = field(default_factory=list)
    fix_rounds: int = 0
    unresolved_p1: list[dict[str, Any]] = field(default_factory=list)
    # True when the visual review could not run (e.g. the render service was unavailable). The BUILT
    # design is still returned untouched — a review failure must never discard a successful build.
    review_skipped: bool = False


def _normalise_findings(raw: Any, scene: int) -> list[dict[str, Any]]:
    """Coerce a critic response into well-formed, stably ordered findings (bad rows dropped)."""
    out: list[dict[str, Any]] = []
    for i, f in enumerate((raw or {}).get("findings") or []):
        if not isinstance(f, dict):
            continue
        sev = str(f.get("severity", "")).upper()
        if sev not in SEVERITIES:
            continue
        fix = f.get("fix") if isinstance(f.get("fix"), dict) else {}
        op = fix.get("op")
        out.append({
            "id": str(f.get("id") or f"s{scene}-r{i}"),
            "severity": sev,
            "scene": int(f.get("scene", scene)),
            "region": f.get("region"),
            "issue": str(f.get("issue", "")),
            "fix": {**fix, "op": op if op in FIX_OPS else None},
        })
    out.sort(key=lambda x: (SEVERITIES.index(x["severity"]), x["scene"], x["id"]))
    return out


def critique_design(
    design: dict[str, Any],
    *,
    render_fn: RenderFn,
    critique_fn: CritiqueFn,
    prior: list[dict[str, Any]] | None = None,
    scenes: list[int] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Render the given scenes (default: all) and critique each blind. Returns (findings,
    verifications of ``prior``). ``scenes`` lets the loop review one scene at a time."""
    findings: list[dict[str, Any]] = []
    verifs: dict[str, dict[str, Any]] = {}
    all_scenes = design.get("scenes") or [None]
    indices = scenes if scenes is not None else list(range(len(all_scenes)))
    for scene in indices:
        # Image critique needs ONE representative still, not the full motion sample set. Render the
        # SETTLED end-state frame (entrances resolved), NOT a mid-scene frame: mid-animation, text
        # is still flying in at partial opacity, so a reviewer reads a real overlap/clip as "in
        # progress" and lets it through. The viewer judges the composed result — so must the eye.
        dur = int((all_scenes[scene] or {}).get("duration_ms") or 3000)
        settled = max(0, dur - 1)
        rendered = render_fn(design, scene, [settled])
        extra: list[Any] = [{"kind": "checklist", "items": list(CHECKLIST)}]
        scene_prior = [p for p in (prior or []) if p["scene"] == scene]
        if scene_prior:
            extra.append({"kind": "verify", "findings": scene_prior})
        extra.extend(rendered.get("broken_images") or [])
        # The critic's judgment stays blind (images + checklist only); the scene JSON is passed
        # solely to key the deterministic no-key stub reproducibly (Contract 4), never the brief.
        resp = critique_fn(list(rendered.get("pngs") or []), "image", extra, all_scenes[scene])
        findings.extend(_normalise_findings(resp, scene))
        for v in (resp or {}).get("verifications") or []:
            if isinstance(v, dict) and v.get("id") is not None:
                verifs[str(v["id"])] = v
    verifications = []
    for p in prior or []:
        status = (verifs.get(p["id"]) or {}).get("status")
        verifications.append({
            "id": p["id"],
            "scene": p["scene"],
            "status": status if status in VERIFY_STATUSES else "not",
        })
    return _dedupe_findings(findings), verifications


def _dedupe_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop repeated findings — the critic sometimes restates the same problem. Keep the FIRST per
    (scene, normalised issue text); already severity-sorted, so the kept one is the worst."""
    seen: set[tuple[int, str]] = set()
    out: list[dict[str, Any]] = []
    for f in findings:
        key = (int(f.get("scene", 0)), " ".join(str(f.get("issue", "")).lower().split()))
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def _scene_handles(observe_fn: ObserveFn | None, design: dict[str, Any], scenes: list[int]) -> str:
    """A compact 'nodes in scene N' map so the agent turns a reviewer's LOCATION into a node id
    without guessing. Best-effort: observe is text-only + cheap; any failure omits the hints."""
    if observe_fn is None:
        return ""
    lines: list[str] = []
    for s in sorted({int(x) for x in scenes}):
        try:
            obs = observe_fn(design, s)
        except Exception:  # noqa: BLE001 - hints are optional; never fail the fix over them
            continue
        for sc in (obs or {}).get("scenes") or []:
            nodes = sc.get("nodes") or []
            if nodes:
                lines.append(
                    f"Scene {s} nodes: " + "; ".join(
                        f"{nd.get('id')} ({nd.get('type')}) — {str(nd.get('brief', ''))[:50]}"
                        for nd in nodes[:12]
                    )
                )
    return "\n".join(lines)


def _fix_prompt(p1: list[dict[str, Any]]) -> str:
    lines = [
        "A visual reviewer (who saw the RENDERED image, not the code) found these problems.",
        "Fix ONLY these, with the smallest edits to the EXISTING design:",
    ]
    for f in p1:
        loc = f" at {f['region']}" if f.get("region") else ""
        lines.append(f"- (scene {f['scene']}{loc}) {f['issue']}")
    return "\n".join(lines)


def run_critic_loop(
    *,
    settings: Settings,
    design: dict[str, Any],
    prompt: str,
    items: list[AgentItem],
    spec: list[dict[str, Any]],
    apply_fn: ApplyFn,
    observe_fn: ObserveFn,
    generate_image_fn: GenerateImageFn,
    render_fn: RenderFn,
    critique_fn: CritiqueFn,
    build_fn: BuildFn = run_studio_graph,
    max_rounds: int = MAX_ROUNDS,
    thread_id: str | None = None,
    **build_kwargs: Any,
) -> CriticLoopResult:
    rounds_cap = max(1, min(int(max_rounds), MAX_ROUNDS))
    # One thread_id for the whole request: every build + review round is its own named trace, all
    # grouped under this thread in LangSmith so they read as one run instead of scattered fragments.
    thread_id = thread_id or uuid.uuid4().hex
    ls = settings.langsmith_enabled() if settings is not None else False
    on_step = build_kwargs.get("on_step")
    cancel_check = build_kwargs.get("cancel_check")

    def emit(action: str, note: str) -> None:
        if on_step is not None:
            on_step({"action": action, "note": note})

    common = dict(
        settings=settings, items=items, spec=spec, apply_fn=apply_fn, observe_fn=observe_fn,
        generate_image_fn=generate_image_fn, thread_id=thread_id, **build_kwargs,
    )
    result = build_fn(design=design, prompt=prompt, run_name="studio-build", **common)
    out = CriticLoopResult(result=result)
    # chat_history for the fix rounds: the original task + what the agent said it did, so a round
    # CONTINUES the conversation (the running prompt is {system}{tools}{history}{new input}) instead
    # of starting cold. Kept to two compact turns — not the full tool transcript — to stay cheap.
    history: list[tuple[str, str]] = [("user", prompt)]
    if result.summary:
        history.append(("assistant", result.summary))
    # PER-SCENE review: bring EACH scene up to the standard before the build is done — review scene
    # i, fix its issues, re-review, up to `rounds_cap` rounds, then move to scene i+1. (A single
    # whole-design review let weak scenes through; gating per scene holds every one to the bar.)
    num_scenes = len(result.design.get("scenes") or [])
    rnd = 0  # a monotonically increasing round id across all scenes, for stable RoundReport ids
    for i in range(num_scenes):
        if cancel_check is not None and cancel_check():
            break  # user stopped — keep what was built
        prior: list[dict[str, Any]] = []
        for n in range(1, rounds_cap + 1):
            if cancel_check is not None and cancel_check():
                break
            rnd += 1
            emit("review", f"Reviewing scene {i + 1}/{num_scenes} (round {n})…")
            try:
                meta = {"session_id": thread_id, "thread_id": thread_id, "scene": i, "rnd": n}
                with trace_span(f"studio-review-s{i}-r{n}", enabled=ls, metadata=meta):
                    findings, verifs = critique_design(
                        result.design, render_fn=render_fn, critique_fn=critique_fn,
                        prior=prior or None, scenes=[i],
                    )
            except Exception as e:  # noqa: BLE001 — review is an enhancement, never a build gate
                # A render/vision failure (e.g. the render service is down) must NEVER discard a
                # successful build: stop reviewing and return what was built so it still reaches the
                # canvas. If it fails for one scene it'll fail for all, so stop entirely.
                logger.info("critic loop: review unavailable (%s); returning built design", e)
                emit("review", "Visual review unavailable — keeping the built design.")
                out.review_skipped = True
                return out
            out.rounds.append(RoundReport(round=rnd, findings=findings, verifications=verifs))
            # Drive fixes on P1 (broken) + P2 (should-fix); P3 is polish, left alone.
            to_fix = [f for f in findings if f["severity"] in ("P1", "P2")]
            if not to_fix:
                emit("review", f"Scene {i + 1} meets the standard.")
                break
            if n == rounds_cap:
                out.unresolved_p1 += [f for f in to_fix if f["severity"] == "P1"]
                emit("review", f"Scene {i + 1}: {len(to_fix)} issue(s) remain after {n} rounds.")
                break
            # Fix THIS scene on the populated design, with the critiques as the new input, the
            # conversation so far as history, and the scene's node handles so each LOCATION maps to
            # a node id.
            fix = _fix_prompt(to_fix)
            handles = _scene_handles(observe_fn, result.design, [i])
            if handles:
                fix += "\n\nNodes you can edit (map each location to a node id):\n" + handles
            emit("fix", f"Fixing scene {i + 1} ({len(to_fix)} issue(s))…")
            result = build_fn(
                design=result.design, prompt=fix, history=history,
                run_name=f"studio-fix-s{i}-r{n}", **common,
            )
            history.append(("user", fix))
            if result.summary:
                history.append(("assistant", result.summary))
            out.result = result
            out.fix_rounds += 1
            prior = to_fix  # next round re-verifies the issues we asked the agent to fix
    return out
