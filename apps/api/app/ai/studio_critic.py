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

Bounded (AC103b): at most ``MAX_ROUNDS`` critique rounds; only P1 findings drive a fix. Round 2
re-verifies each prior finding as fixed / partly / not (AC103c). Deterministic given deterministic
injected fns (Contract 4): no clock, randomness or I/O here.
"""

from __future__ import annotations

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
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Render each scene and critique it blind. Returns (findings, verifications of ``prior``)."""
    findings: list[dict[str, Any]] = []
    verifs: dict[str, dict[str, Any]] = {}
    scenes = design.get("scenes") or [None]
    for scene in range(len(scenes)):
        rendered = render_fn(design, scene, None)
        extra: list[Any] = [{"kind": "checklist", "items": list(CHECKLIST)}]
        scene_prior = [p for p in (prior or []) if p["scene"] == scene]
        if scene_prior:
            extra.append({"kind": "verify", "findings": scene_prior})
        extra.extend(rendered.get("broken_images") or [])
        # The critic's judgment stays blind (images + checklist only); the scene JSON is passed
        # solely to key the deterministic no-key stub reproducibly (Contract 4), never the brief.
        resp = critique_fn(list(rendered.get("pngs") or []), "image", extra, scenes[scene])
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
    return findings, verifications


def _fix_prompt(p1: list[dict[str, Any]]) -> str:
    lines = ["A visual review found blocking (P1) problems. Fix ONLY these, with minimal edits:"]
    for f in p1:
        lines.append(f"- [{f['id']}] scene {f['scene']} @ {f['region']}: {f['issue']} "
                     f"-> {f['fix']}")
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
    **build_kwargs: Any,
) -> CriticLoopResult:
    rounds_cap = max(1, min(int(max_rounds), MAX_ROUNDS))
    common = dict(
        settings=settings, items=items, spec=spec, apply_fn=apply_fn, observe_fn=observe_fn,
        generate_image_fn=generate_image_fn, **build_kwargs,
    )
    result = build_fn(design=design, prompt=prompt, **common)
    out = CriticLoopResult(result=result)
    prior: list[dict[str, Any]] = []
    for n in range(1, rounds_cap + 1):
        findings, verifs = critique_design(
            result.design, render_fn=render_fn, critique_fn=critique_fn, prior=prior or None
        )
        out.rounds.append(RoundReport(round=n, findings=findings, verifications=verifs))
        p1 = [f for f in findings if f["severity"] == "P1"]
        out.unresolved_p1 = p1
        if not p1 or n == rounds_cap:
            break
        result = build_fn(design=result.design, prompt=_fix_prompt(p1), **common)
        out.result = result
        out.fix_rounds += 1
        prior = p1
    return out
