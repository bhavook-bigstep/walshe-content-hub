"""Shared primitives for the Studio Builder agent: grounded-op types + the deterministic stub.

The live agent loop now lives in ``app.ai.studio_graph`` (a LangGraph ReAct agent over native
tool calls). This module holds what that loop reuses:

- the injected-capability type aliases (``ApplyFn`` / ``ObserveFn`` / ``GenerateSpriteFn``) and the
  value types (``AgentItem`` / ``StudioAgentResult``);
- ``_catalog_lines`` — the approved-item index rendered into the system prompt (grounding, AC6);
- ``_summarize`` — the short, context-cheap design view fed back after each op;
- ``_deterministic_compose`` — the Contract 4 fallback (no key / provider failure): one fixed,
  grounded compose that the same brief + items always reproduce, so tests/dev stay hermetic.

Grounding (Contract 1) is NOT this module's job: ``apply_fn`` already resolves the agent's visible
catalog + real image refs (the FastAPI visibility choke-point) before the Node engine sees anything.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

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


def _catalog_lines(items: list[AgentItem]) -> str:
    if not items:
        return "(none selected — do not place any image)"
    return "\n".join(
        f"- {it.id} — {it.title}" + (f" ({it.destination})" if it.destination else "")
        for it in items
    )


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
