"""The Studio Builder agent as a LangGraph ReAct loop over NATIVE tool calls.

Each Studio op is a real LangChain tool the model function-calls (so every op is a real tool call,
shown natively in LangSmith), plus meta-tools (observe / select_scene / generate_sprite). The loop +
orchestration is LangGraph's prebuilt ReAct agent; the LLM is LangChain's Gemini chat model, so the
same wiring works for Claude/OpenAI by swapping the model. Grounding + execution stay server-side:
the tools call the injected apply/observe/generate fns (which enforce Contract 1).

No key → the deterministic stub compose (Contract 4), so tests/dev stay hermetic. Tracing is
automatic via LangSmith when a key is set (configure_langsmith); nothing here logs the API key.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import Field, create_model

from app.ai.studio_agent import (
    AgentItem,
    ApplyFn,
    GenerateSpriteFn,
    ObserveFn,
    StudioAgentResult,
    _catalog_lines,
    _deterministic_compose,
    _summarize,
)
from app.config import Settings

logger = logging.getLogger("app.ai.studio_graph")

# Params the model should send as numbers (so the op layer doesn't reject a string).
_NUMBER_PARAMS = frozenset(
    {
        "x", "y", "width", "height", "radius", "opacity", "angle", "strokeWidth", "fontSize",
        "lineHeight", "duration_ms", "at_ms", "start_ms", "loop_period_ms", "period_ms", "fps",
        "frames", "scene_index", "from", "to",
    }
)


def _system_prompt(prompt: str, items: list[AgentItem]) -> str:
    return (
        "You are the Studio Builder agent. Build a design that satisfies the BRIEF by CALLING the "
        "tools — each tool is a Design Studio operation. Be efficient; you may call several tools "
        "per turn, and STOP (reply with a short summary, no tool call) once the brief is done.\n"
        "- Set a background colour, a bold headline (write_copy), PLACE every approved item "
        "with a short grounded caption, and a tasteful accent.\n"
        "- Multi-scene reel: add_scene then select_scene for each next scene; set a transition "
        "(set_scene_transition) and, for a voiceover, narration (set_scene_narration).\n"
        "- Call observe to read the current scene in words before guessing its layout.\n"
        "- Reference ONLY the approved item ids below; never invent facts, stats or prices.\n\n"
        "Approved catalog item ids (use ONLY these):\n"
        f"{_catalog_lines(items)}\n\nBRIEF: {prompt.strip()}"
    )


class _BuilderSession:
    """Mutable build state the tools act on (the design lives here, not in the LangGraph message
    state). Each tool call runs one op server-side, updates the design, and emits a step (so the
    host streams live progress + a design snapshot)."""

    def __init__(
        self,
        design: dict[str, Any],
        scene_index: int,
        apply_fn: ApplyFn,
        observe_fn: ObserveFn,
        generate_sprite_fn: GenerateSpriteFn,
        on_step: Any,
        *,
        max_applies: int = 40,
        max_generates: int = 3,
    ) -> None:
        self.design = design
        self.scene = scene_index
        self._apply = apply_fn
        self._observe = observe_fn
        self._gen = generate_sprite_fn
        self._on_step = on_step
        self.steps: list[dict[str, Any]] = []
        self.applied = 0
        self.generated = 0
        self._max_applies = max_applies
        self._max_generates = max_generates

    def _emit(self, step: dict[str, Any], *, design: dict[str, Any] | None = None) -> None:
        self.steps.append(step)
        if self._on_step is not None:
            self._on_step({**step, "design": design} if design is not None else step)

    def run_op(self, op_name: str, args: dict[str, Any]) -> dict[str, Any]:
        if self.applied >= self._max_applies:
            return {"error": "edit budget reached — stop and summarise"}
        clean = {k: v for k, v in args.items() if v is not None}
        res = self._apply(self.design, [{"op": op_name, **clean}], self.scene)
        self.design = res["design"]
        self.applied += 1
        op_result = (res.get("results") or [{}])[0]
        self._emit(
            {"action": "apply", "op": op_name, "scene": self.scene,
             "results": res.get("results", [])},
            design=self.design,
        )
        return {
            "status": op_result.get("status"),
            "reason": op_result.get("reason"),
            "scene": _summarize(self.design, self.scene),
        }

    def observe(self, scene_index: int | None = None) -> dict[str, Any]:
        target = self.scene if scene_index is None else scene_index
        obs = self._observe(self.design, target)
        self._emit({"action": "observe", "scene": target})
        return obs

    def select_scene(self, scene_index: int) -> dict[str, Any]:
        scenes = self.design.get("scenes") or []
        if 0 <= scene_index < len(scenes):
            self.scene = scene_index
            self._emit({"action": "select-scene", "scene": self.scene})
            return {"editing_scene": self.scene}
        return {"error": f"scene must be 0..{len(scenes) - 1}; add_scene first if you need more"}

    def generate_sprite(self, concept: str, frames: int = 4) -> dict[str, Any]:
        if self.generated >= self._max_generates:
            return {"error": "sprite-generation budget reached"}
        try:
            handle = self._gen(concept, {"frames": frames})
        except Exception:  # noqa: BLE001 - a generation failure must not kill the loop
            logger.info("studio-graph sprite generation failed")
            return {"error": "sprite generation failed"}
        self.generated += 1
        self._emit({"action": "generate-sprite", "ref": handle.get("ref")})
        return handle


def _args_model(tool_name: str, params: dict[str, Any]):
    """Build a pydantic args schema for a studio op from its spec params (typed + required)."""
    fields: dict[str, Any] = {}
    for name, desc in params.items():
        text = str(desc)
        if name == "node_ids":
            annotation: Any = list[str]
        elif name == "cues":
            annotation = list[dict]
        elif name in _NUMBER_PARAMS:
            annotation = float
        else:
            annotation = str
        if "optional" in text.lower():
            fields[name] = (annotation | None, Field(default=None, description=text))
        else:
            fields[name] = (annotation, Field(description=text))
    return create_model(f"{tool_name}_args", **fields)


def _build_tools(session: _BuilderSession, spec: list[dict[str, Any]]) -> list[Any]:
    from langchain_core.tools import StructuredTool

    tools: list[Any] = []
    for op in spec:
        op_name = str(op.get("op") or "")
        if not op_name:
            continue
        tool_name = op_name.replace("-", "_")

        def _make(hyphenated: str):
            def _run(**kwargs: Any) -> dict[str, Any]:
                return session.run_op(hyphenated, kwargs)

            return _run

        tools.append(
            StructuredTool.from_function(
                _make(op_name),
                name=tool_name,
                description=str(op.get("description", "")),
                args_schema=_args_model(tool_name, op.get("params") or {}),
            )
        )

    tools.append(
        StructuredTool.from_function(
            lambda scene_index=None: session.observe(
                int(scene_index) if scene_index is not None else None
            ),
            name="observe",
            description="Read an accurate word description of the current (or given) scene.",
        )
    )
    tools.append(
        StructuredTool.from_function(
            lambda scene_index: session.select_scene(int(scene_index)),
            name="select_scene",
            description="Switch the scene you edit (with add_scene for multi-scene reels).",
        )
    )
    tools.append(
        StructuredTool.from_function(
            lambda concept, frames=4: session.generate_sprite(concept, int(frames)),
            name="generate_sprite",
            description="Generate an animated sprite; returns a ref to place with add_sprite.",
        )
    )
    return tools


def run_studio_graph(
    *,
    settings: Settings,
    design: dict[str, Any],
    prompt: str,
    items: list[AgentItem],
    spec: list[dict[str, Any]],
    apply_fn: ApplyFn,
    observe_fn: ObserveFn,
    generate_sprite_fn: GenerateSpriteFn,
    scene_index: int = 0,
    max_rounds: int = 24,
    on_step: Any = None,
) -> StudioAgentResult:
    """Run the LangGraph ReAct builder and return the edited design + step transcript.

    No Gemini key → the deterministic stub compose (Contract 4). A provider/graph error after some
    edits returns what was built; before any edit, it falls back to the stub so a build always
    yields something.
    """
    if (settings.ai_provider or "").lower() != "gemini" or not settings.gemini_api_key:
        return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)

    from langchain_google_genai import ChatGoogleGenerativeAI
    from langgraph.prebuilt import create_react_agent

    session = _BuilderSession(
        design, scene_index, apply_fn, observe_fn, generate_sprite_fn, on_step
    )
    tools = _build_tools(session, spec)
    model = ChatGoogleGenerativeAI(
        model=settings.ai_model, google_api_key=settings.gemini_api_key, temperature=0.4
    )
    agent = create_react_agent(model, tools, prompt=_system_prompt(prompt, items))
    try:
        agent.invoke(
            {"messages": [("user", "Build the design to satisfy the brief, then stop.")]},
            config={"recursion_limit": max(6, max_rounds * 2)},
        )
    except Exception:  # noqa: BLE001 - any model/graph error degrades gracefully
        logger.info("studio-graph run failed; using what was built (or the deterministic compose)")
        if session.applied == 0:
            return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)

    if session.applied == 0:
        return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)
    if on_step is not None:
        on_step({"action": "finish", "note": "Build complete"})
    session.steps.append({"action": "finish", "note": "Build complete"})
    return StudioAgentResult(
        design=session.design, steps=session.steps, applied=session.applied,
        finished=True, provider="gemini",
    )
