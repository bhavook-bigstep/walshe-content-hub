"""Studio Builder agent — the in-app AI Builder's server-run tool loop over the grounded studio-ops.

A genuine multi-turn loop (the model acts, sees the result, acts again) built on the AC16
``AIProvider`` text interface — no native tool-use needed, so the deterministic stub still works and
tests stay hermetic (Contract 4). An MCP host runs its OWN loop over the ops endpoints; this
is the *inbuilt* host.

Context-window discipline (the whole point of the protocol):
- The system prompt carries only a compact INDEX — ``op: one-line description`` — never the param
  schemas. It stays cheap as the op catalog grows toward full Studio parity.
- Full op parameters enter the model's context ONLY when it asks, via ``describe_ops`` — and only
  for the ops it names. Schemas are disclosed progressively, not up front.
- Design state is fed back as a short SUMMARY (scene/node counts), never the whole ``DesignDoc``.

Grounding (Contract 1) is NOT this module's job: it receives an injected ``apply_fn`` that already
resolves the agent's visible catalog + real image refs (the FastAPI visibility choke-point) before
the Node engine sees anything. The core is pure orchestration over ``provider`` + ``apply_fn``.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.ai.base import AIProvider, ChatMessage
from app.observability.tracing import traced

logger = logging.getLogger("app.ai.studio_agent")


@traced("studio-agent.turn", "llm")
def _llm_turn(provider: AIProvider, system: str, messages: list[ChatMessage]) -> str:
    """One model turn — traced to LangSmith (system + messages → reply) for debugging."""
    return "".join(provider.stream_chat(system, messages, max_tokens=800))

# (design, op calls, scene index) -> {"design", "results", "valid"} from the studio-ops engine.
ApplyFn = Callable[[dict[str, Any], list[dict[str, Any]], int], dict[str, Any]]
# (design, scene index or None for all) -> the structured scene observation (descriptions + counts).
ObserveFn = Callable[[dict[str, Any], "int | None"], dict[str, Any]]
# (concept, opts) -> a sprite handle {ref, frame_count, fps, width, height}. The fn also remembers
# the generated frames host-side so a later `add-sprite <ref>` can place them (Contract 1 pattern).
GenerateSpriteFn = Callable[[str, dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class AgentItem:
    """An approved catalog item the agent may reference (listed in the index)."""

    id: int
    title: str
    destination: str = ""


@dataclass
class StudioAgentResult:
    design: dict[str, Any]
    steps: list[dict[str, Any]] = field(default_factory=list)
    applied: int = 0
    finished: bool = False
    provider: str = "stub"


def _index(spec: list[dict[str, Any]]) -> str:
    """The compact tool index for the system prompt: names + one-liners, NO param schemas."""
    return "\n".join(f"- {o['op']}: {o['description']}" for o in spec if o.get("op"))


def _catalog_lines(items: list[AgentItem]) -> str:
    if not items:
        return "(none selected — do not place any image)"
    return "\n".join(
        f"- {it.id} — {it.title}" + (f" ({it.destination})" if it.destination else "")
        for it in items
    )


def build_system_prompt(prompt: str, spec: list[dict[str, Any]], items: list[AgentItem]) -> str:
    """Compact system prompt: the op INDEX + the approved items + the loop protocol. No schemas."""
    return (
        "You are the Studio Builder agent. You edit a design one step at a time by replying with "
        "EXACTLY ONE json object and nothing else.\n\n"
        "Available ops (names + what they do). You must fetch an op's parameters with describe_ops "
        "BEFORE you first use it:\n"
        f"{_index(spec)}\n\n"
        "Approved catalog item ids you may reference (use ONLY these ids):\n"
        f"{_catalog_lines(items)}\n\n"
        "On EVERY action include a short \"note\" (a 3–8 word phrase) saying what you're doing, "
        'e.g. "note":"Placing the hero photo and headline" — it is shown to the user as live '
        "progress.\n\n"
        "Protocol — each reply is one of these json objects:\n"
        '  {"action":"observe","scene":0} (or "scene":"all") '
        "— I reply with an accurate word description of the scene(s) as they are now.\n"
        '  {"action":"select-scene","scene":1} '
        "— switch the scene you edit. For a multi-scene reel: add-scene to append a blank scene, "
        "then select-scene to build into it.\n"
        '  {"action":"generate-sprite","concept":"a walking fox","frames":4} '
        "— I generate an animated sprite (frames motion images, 2-8) and reply with its ref; then "
        'add-sprite with {"op":"add-sprite","sprite":"<that ref>"}.\n'
        '  {"action":"describe_ops","ops":["place","write-copy"]} '
        "— I reply with those ops' parameters.\n"
        '  {"action":"apply","calls":[{"op":"...","...":"..."}, {"op":"...","...":"..."}]} '
        "— I apply ALL the calls (put MANY ops in one apply) and reply with results + a summary.\n"
        '  {"action":"finish","note":"..."} — stop once the brief is satisfied.\n'
        "Rules: you have only a few turns, so be EFFICIENT — describe the ops you need once, then "
        "build the whole design in ONE apply with many calls (don't do one op per turn). A good "
        "social post sets a background colour, a bold headline (write-copy), PLACES every approved "
        "item (place) with a short grounded caption, and a tasteful accent; then finish. For a "
        "reel or story, build this scene, then add-scene + select-scene for each next one, set a "
        "transition (set-scene-transition), and add narration for a voiceover. "
        "Reference only approved ids; never invent facts. Reply with one json object only — no "
        "prose, no markdown.\n\n"
        f"BRIEF: {prompt.strip()}"
    )


def _params_for(spec_by_op: dict[str, dict[str, Any]], names: list[Any]) -> dict[str, Any]:
    """The param schemas for the requested (known) ops — the on-demand disclosure payload."""
    out: dict[str, Any] = {}
    for name in names:
        if isinstance(name, str) and name in spec_by_op:
            out[name] = spec_by_op[name].get("params", {})
    return out


def _summarize(design: dict[str, Any], scene_index: int) -> str:
    """A short, context-cheap view of the design state fed back to the model (not the full doc)."""
    scenes = design.get("scenes") or []
    parts = [f"scenes={len(scenes)}"]
    if 0 <= scene_index < len(scenes):
        scene = scenes[scene_index]
        nodes = scene.get("nodes") or []
        kinds: dict[str, int] = {}
        for n in nodes:
            kinds[n.get("type", "?")] = kinds.get(n.get("type", "?"), 0) + 1
        kind_str = ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())) or "empty"
        bg = scene.get("background")
        parts.append(f"scene{scene_index}: {kind_str}" + (f", bg={bg}" if bg else ""))
    return "; ".join(parts)


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Parse the reply into one json object, tolerating surrounding prose/markdown fences."""
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else None
    except (ValueError, TypeError):
        pass
    start, depth = -1, 0
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    obj = json.loads(text[start : i + 1])
                    return obj if isinstance(obj, dict) else None
                except (ValueError, TypeError):
                    start = -1
    return None


def _deterministic_compose(
    design: dict[str, Any],
    prompt: str,
    items: list[AgentItem],
    scene_index: int,
    apply_fn: ApplyFn,
    on_step: "Callable[[dict[str, Any]], None] | None" = None,
) -> StudioAgentResult:
    """Contract 4 fallback (stub / provider failure): one fixed, grounded compose, then done.

    No model, no network beyond apply_fn — the same brief + items always yield the same calls, and
    apply_fn still enforces grounding so nothing ungrounded slips through.
    """
    calls: list[dict[str, Any]] = [
        {"op": "set-background", "color": "#0e2a26"},
        {"op": "write-copy", "text": (prompt.strip()[:80] or "Discover")},
    ]
    for it in items:
        calls.append({"op": "place", "item_id": it.id})
        calls.append({"op": "write-copy", "text": it.title, "item_id": it.id})
    res = apply_fn(design, calls, scene_index)
    steps = [
        {"action": "apply", "results": res.get("results", []), "note": "Composing the layout"},
        {"action": "finish", "note": "deterministic compose"},
    ]
    if on_step is not None:
        on_step({**steps[0], "design": res["design"]})  # stream the composed design for live render
        on_step(steps[1])
    return StudioAgentResult(
        design=res["design"], steps=steps, applied=1, finished=True, provider="stub"
    )


@traced("studio-agent.build", "chain")
def run_studio_agent(
    *,
    design: dict[str, Any],
    prompt: str,
    items: list[AgentItem],
    spec: list[dict[str, Any]],
    provider: AIProvider,
    apply_fn: ApplyFn,
    observe_fn: ObserveFn,
    generate_sprite_fn: GenerateSpriteFn,
    scene_index: int = 0,
    max_rounds: int = 10,
    max_applies: int = 6,
    max_generates: int = 3,
    on_step: "Callable[[dict[str, Any]], None] | None" = None,
) -> StudioAgentResult:
    """Run the progressive-disclosure tool loop and return the edited design + the step transcript.

    ``apply_fn`` already grounds every call (Contract 1); ``spec`` is the full op catalog held
    server-side and disclosed to the model only via ``describe_ops``. ``on_step`` (optional) is
    called with each step as it happens, so a host can stream live progress (the agent's notes).
    """
    result = StudioAgentResult(design=design, provider=provider.name)

    def emit(step: dict[str, Any], note: Any = "", *, design: dict[str, Any] | None = None) -> None:
        if note:
            step.setdefault("note", str(note))
        result.steps.append(step)  # kept lean (no design) so the non-stream response stays small
        if on_step is not None:
            # Stream a design SNAPSHOT with the step so the host can render the build live.
            on_step({**step, "design": design} if design is not None else step)

    if provider.name == "stub":
        return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)

    spec_by_op = {o["op"]: o for o in spec if o.get("op")}
    system = build_system_prompt(prompt, spec, items)
    messages: list[ChatMessage] = [
        ChatMessage("user", "Begin. Edit the design to satisfy the BRIEF.")
    ]
    current_scene = scene_index
    generated = 0

    for _ in range(max_rounds):
        try:
            text = _llm_turn(provider, system, messages)
        except Exception:  # noqa: BLE001 - a flaky provider degrades to the deterministic path
            logger.info("studio-agent provider call failed; falling back to deterministic compose")
            if result.applied == 0:
                return _deterministic_compose(
                    design, prompt, items, scene_index, apply_fn, on_step
                )
            result.finished = True
            return result

        action = _extract_json_object(text)
        if action is None:
            messages.append(ChatMessage("assistant", text))
            messages.append(
                ChatMessage(
                    "user",
                    'Reply with exactly one json object: describe_ops, apply, or finish.',
                )
            )
            emit({"action": "invalid"})
            continue

        kind = action.get("action")
        note = action.get("note", "")
        if kind == "finish":
            emit({"action": "finish", "note": str(note)})
            result.finished = True
            break

        if kind == "observe":
            target = action.get("scene", current_scene)
            if target == "all":
                scene_arg = None
            else:
                scene_arg = target if isinstance(target, int) else current_scene
            observation = observe_fn(result.design, scene_arg)
            emit({"action": "observe", "scene": target}, note)
            messages.append(ChatMessage("assistant", json.dumps(action)))
            messages.append(ChatMessage("user", json.dumps(observation)))
            continue

        if kind == "select-scene":
            scenes = result.design.get("scenes") or []
            target = action.get("scene")
            if isinstance(target, int) and 0 <= target < len(scenes):
                current_scene = target
                emit({"action": "select-scene", "scene": current_scene}, note)
                messages.append(ChatMessage("assistant", json.dumps(action)))
                messages.append(
                    ChatMessage("user", json.dumps({"editing_scene": current_scene}))
                )
            else:
                emit({"action": "select-scene", "error": "out of range"})
                messages.append(
                    ChatMessage(
                        "user",
                        f"scene must be 0..{len(scenes) - 1}; add-scene first if you need more.",
                    )
                )
            continue

        if kind == "generate-sprite":
            concept = action.get("concept")
            if not isinstance(concept, str) or not concept.strip():
                messages.append(ChatMessage("assistant", json.dumps(action)))
                messages.append(ChatMessage("user", "generate-sprite needs a non-empty concept."))
                result.steps.append({"action": "generate-sprite", "error": "missing concept"})
                continue
            if generated >= max_generates:
                messages.append(ChatMessage("user", "Sprite-generation budget reached."))
                emit({"action": "generate-sprite", "skipped": "budget"})
                continue
            opts = {k: action[k] for k in ("frames", "fps") if k in action}
            try:
                handle = generate_sprite_fn(concept, opts)
            except Exception:  # noqa: BLE001 - a generation failure must not kill the loop
                logger.info("studio-agent sprite generation failed")
                messages.append(ChatMessage("user", "Sprite generation failed; try another way."))
                emit({"action": "generate-sprite", "error": "generation failed"})
                continue
            generated += 1
            emit({"action": "generate-sprite", "ref": handle.get("ref")}, note)
            messages.append(ChatMessage("assistant", json.dumps(action)))
            messages.append(ChatMessage("user", json.dumps({"sprite": handle})))
            continue

        if kind == "describe_ops":
            payload = _params_for(spec_by_op, action.get("ops", []))
            emit({"action": "describe_ops", "ops": list(payload)}, note)
            messages.append(ChatMessage("assistant", json.dumps(action)))
            messages.append(ChatMessage("user", json.dumps({"params": payload})))
            continue

        if kind == "apply":
            if result.applied >= max_applies:
                messages.append(ChatMessage("user", "Apply budget reached — finish now."))
                emit({"action": "apply", "skipped": "budget"})
                continue
            calls = action.get("calls")
            calls = calls if isinstance(calls, list) else []
            res = apply_fn(result.design, calls, current_scene)
            result.design = res["design"]
            result.applied += 1
            emit(
                {"action": "apply", "scene": current_scene, "results": res.get("results", [])},
                note,
                design=result.design,  # snapshot so the UI renders the build live
            )
            feedback = {
                "results": res.get("results", []),
                "valid": res.get("valid"),
                "design": _summarize(result.design, current_scene),
            }
            messages.append(ChatMessage("assistant", json.dumps(action)))
            messages.append(ChatMessage("user", json.dumps(feedback)))
            continue

        # Unknown action — nudge back onto the protocol.
        messages.append(
            ChatMessage("user", "Unknown action. Use describe_ops, apply, or finish.")
        )
        emit({"action": "unknown"})

    # Safety net: if the model ran out of turns WITHOUT finishing and never applied anything (it
    # flailed), fall back to a deterministic grounded compose so a build always yields something.
    if not result.finished and result.applied == 0:
        return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)
    return result
