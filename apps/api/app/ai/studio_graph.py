"""The Studio Builder agent as a LangGraph ReAct loop over NATIVE tool calls.

Each Studio op is a real LangChain tool the model function-calls (so every op is a real tool call,
shown natively in LangSmith), plus meta-tools (observe / select_scene / generate_image). The loop +
orchestration is LangGraph's prebuilt ReAct agent; the LLM is LangChain's Gemini chat model, so the
same wiring works for Claude/OpenAI by swapping the model. Grounding + execution stay server-side:
the tools call the injected apply/observe/generate fns (which enforce Contract 1).

No key → the deterministic stub compose (Contract 4), so tests/dev stay hermetic. Tracing is
automatic via LangSmith when a key is set (configure_langsmith); nothing here logs the API key.
"""

from __future__ import annotations

import copy
import logging
import threading
from typing import Any

from pydantic import Field, create_model

from app.ai.studio_agent import (
    AgentItem,
    ApplyFn,
    CritiqueFn,
    GenerateImageFn,
    ObserveFn,
    RenderFn,
    StudioAgentResult,
    VisualObserveError,
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


def _system_prompt(
    prompt: str, items: list[AgentItem], width: int, height: int, scene_count: int = 1
) -> str:
    # Concrete, canvas-scaled numbers so the model places deliberately instead of guessing pixels
    # on an unknown artboard (the old prompt gave no dimensions, so everything collapsed top-left).
    margin = round(min(width, height) * 0.07)
    headline = round(height * 0.085)
    body = round(height * 0.038)
    caption = round(height * 0.028)
    content_w = width - 2 * margin
    has_items = bool(items)
    hero = (
        "PLACE the first approved image full-bleed as the hero "
        f"(x=0, y=0, width={width}, height={round(height * 0.62)}); put the headline and captions "
        f"over the lower third with a legibility scrim (add_shape rect, dark colour, opacity 0.45, "
        f"covering the lower third).\n"
        if has_items
        else "No images are approved — build a bold TYPE-led layout: a large headline, a short "
        "supporting line, and one or two accent shapes. Never place an image.\n"
    )
    return (
        "You are the Studio Builder, a senior graphic designer. Build a design that satisfies the "
        "BRIEF by CALLING tools (each tool is a Design Studio operation). Work efficiently and "
        "STOP (reply with a one-line summary, no tool call) once the scene looks finished.\n\n"
        f"CANVAS: {width}×{height} px, origin top-left (x→right, y→down). Keep a {margin}px safe "
        f"margin on every side; the content column is x={margin}..{width - margin} "
        f"(width {content_w}).\n\n"
        "LAYOUT RULES (follow exactly — this is what makes it look professional):\n"
        "1. EVERY element MUST pass explicit x, y and width. Every text MUST also pass fontSize. "
        "Never omit them — omitted coordinates all stack in the corner and ruin the layout.\n"
        "2. Never place two elements at the same x,y. Stack text vertically with clear gaps "
        f"(leave ~{round(body * 1.5)}px between lines).\n"
        f"3. Type scale (px for THIS canvas): headline ≈ {headline} bold; subhead/body ≈ {body}; "
        f"caption ≈ {caption}. One headline only.\n"
        f"4. {hero}"
        "5. Pick a cohesive palette: a background colour plus high-contrast text (light text on a "
        "dark/photo area, dark text on light). Ensure text is readable over its background.\n"
        "6. Keep it clean: at most ~6 elements per scene. A tasteful accent shape beats clutter.\n"
        "7. Build each scene in ONE clean pass. Do NOT delete everything and start over — if a "
        "layout is off, MOVE or RESTYLE the existing node (by its id). Deleting and rebuilding the "
        "same scene wastes your budget and leaves other scenes empty.\n"
        f"8. This design has {scene_count} scene(s). The BRIEF may ask for more — add_scene to "
        "append blank scenes. You MUST give EVERY scene content; never leave a scene empty. To "
        "build a specific scene, pass scene=<index> on each element (e.g. scene=1 targets the "
        "second scene) — this is more reliable than select_scene. Work scene 0, then scene 1, then "
        "scene 2… For a reel, set a transition (set_scene_transition) and, for a voiceover, "
        "narration (set_scene_narration) per scene.\n"
        "9. Reference ONLY the approved item ids below; never invent facts, stats or prices.\n"
        "10. IMAGERY: place approved catalog photos with `place`. For a custom visual with no "
        "catalog photo (a backdrop, illustration or icon), call `generate_image` for ONE still, "
        "then place it with `add_image` and animate it with `animate_node`. You CANNOT generate "
        "moving sprites — all motion comes from keyframes (animate_node); `add_sprite` only places "
        "the built-in characters (e.g. walking-panda). Generate sparingly (small budget).\n\n"
        "Approved catalog item ids (use ONLY these):\n"
        f"{_catalog_lines(items)}\n\nBRIEF: {prompt.strip()}"
    )


# Typed observe_visual failures -> short, actionable strings. Each tells the Builder to fall back to
# the cheap text `observe` so a broken renderer never turns into a retry loop.
_VISUAL_FAILURES: dict[str, str] = {
    "timeout": "visual render timed out — use observe (text) instead of retrying",
    "browser_crash": "visual renderer crashed — use observe (text) instead of retrying",
    "bad_workspace": "scene could not be rendered (invalid workspace) — fix scene or use observe",
    "budget_exhausted": "visual-observe budget reached — use observe (text) from now on",
    "no_animation": "scene has no animation or transition — use observe (text) instead",
}


def _visual_error(kind: str) -> dict[str, Any]:
    return {"error": _VISUAL_FAILURES[kind], "reason": kind}


def _scene_is_animated(design: dict[str, Any], scene_index: int) -> bool:
    """True only when the scene has motion worth a video review: a real transition, or any node
    carrying animation/keyframes. Static scenes are cheaper to review as text."""
    scenes = design.get("scenes") or []
    if not 0 <= scene_index < len(scenes):
        return False
    scene = scenes[scene_index] or {}
    transition = scene.get("transition")
    if isinstance(transition, dict):
        transition = transition.get("type") or transition.get("name")
    if transition and str(transition).lower() != "none":
        return True
    for node in scene.get("nodes") or []:
        if isinstance(node, dict) and any(
            node.get(k) for k in ("animation", "animations", "keyframes")
        ):
            return True
    return False


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
        generate_image_fn: GenerateImageFn,
        on_step: Any,
        *,
        max_applies: int = 40,
        max_generates: int = 3,
        render_fn: RenderFn | None = None,
        critique_fn: CritiqueFn | None = None,
        max_visual_observes: int = 3,
    ) -> None:
        self.design = design
        self.scene = scene_index
        self._apply = apply_fn
        self._observe = observe_fn
        self._gen = generate_image_fn
        self._on_step = on_step
        self.steps: list[dict[str, Any]] = []
        self.applied = 0
        self.generated = 0
        self._max_applies = max_applies
        self._max_generates = max_generates
        self._render = render_fn
        self._critique = critique_fn
        self._max_visual = max_visual_observes
        self.visual_observes = 0
        # LangGraph's ToolNode runs a turn's tool calls CONCURRENTLY (sync tools in a thread pool).
        # Every op is a read-modify-write of self.design, so without serialisation parallel calls
        # all read the same base and the last write wins — edits vanish (10 write-copy -> 1 node).
        # This lock makes each op atomic, so the turn's ops thread through the design in order.
        self._lock = threading.Lock()

    def _emit(self, step: dict[str, Any], *, design: dict[str, Any] | None = None) -> None:
        self.steps.append(step)
        if self._on_step is not None:
            self._on_step({**step, "design": design} if design is not None else step)

    def run_op(self, op_name: str, args: dict[str, Any]) -> dict[str, Any]:
        clean = {k: v for k, v in args.items() if v is not None}
        scene_ref = clean.pop("scene", None)  # per-op target (not a studio-op param); stripped here
        with self._lock:  # atomic read-modify-write so parallel tool calls don't clobber each other
            if self.applied >= self._max_applies:
                return {"error": "edit budget reached — stop and summarise"}
            target = self.scene
            if scene_ref is not None:
                try:
                    target = self._resolve_scene(scene_ref)
                except ValueError as e:
                    return {"error": str(e)}
            res = self._apply(self.design, [{"op": op_name, **clean}], target)
            self.design = res["design"]
            self.applied += 1
            op_result = (res.get("results") or [{}])[0]
            self._emit(
                {"action": "apply", "op": op_name, "scene": target,
                 "results": res.get("results", [])},
                design=self.design,
            )
            return {
                "status": op_result.get("status"),
                "reason": op_result.get("reason"),
                "scene": _summarize(self.design, target),
            }

    def _resolve_scene(self, value: Any) -> int:
        """Accept a scene reference as an int index, a numeric string, or a scene id ('scene-0').

        The model routinely passes the scene's id (seen via observe) instead of its index, so a
        strict int() would crash the whole build (it did). Raises ValueError for an unknown id.
        """
        scenes = self.design.get("scenes") or []
        if isinstance(value, bool):
            raise ValueError("scene must be a number or a scene id")
        if isinstance(value, int):
            return value
        s = str(value).strip()
        if s.lstrip("-").isdigit():
            return int(s)
        for i, sc in enumerate(scenes):
            if str(sc.get("id")) == s:
                return i
        raise ValueError(f"unknown scene '{value}' — use index 0..{len(scenes) - 1} or a scene id")

    def observe(self, scene_index: Any = None) -> dict[str, Any]:
        with self._lock:  # read a consistent design, serialised against in-flight writes
            if scene_index is None:
                target: int = self.scene
            else:
                try:
                    target = self._resolve_scene(scene_index)
                except ValueError:
                    target = self.scene  # observe should never fail; fall back to the current scene
            obs = self._observe(self.design, target)
            self._emit({"action": "observe", "scene": target})
            return obs

    def observe_visual(self, scene_index: Any = None, image: bool = True) -> dict[str, Any]:
        """Render the REAL scene and have a vision model critique it.

        ``image=True`` (default) auto-selects the mode: a scene with animation/transitions is
        reviewed as video frames, otherwise as a single still. ``image=False`` asks for video
        explicitly; a static scene then returns the ``no_animation`` fallback. The budget is counted
        under the lock; render + vision (slow, networked) run OUTSIDE it. Failures return short
        actionable strings (never raise) so the Builder falls back to text ``observe``.
        """
        if self._render is None or self._critique is None:
            return _visual_error("bad_workspace")
        with self._lock:
            if self.visual_observes >= self._max_visual:
                return _visual_error("budget_exhausted")
            try:
                target = self.scene if scene_index is None else self._resolve_scene(scene_index)
            except ValueError as e:
                return {"error": str(e), "reason": "bad_workspace"}
            scenes = self.design.get("scenes") or []
            if not 0 <= target < len(scenes):
                return {"error": f"scene must be 0..{len(scenes) - 1}", "reason": "bad_workspace"}
            animated = _scene_is_animated(self.design, target)
            if not image and not animated:
                return _visual_error("no_animation")
            mode = "video" if animated else "image"
            self.visual_observes += 1  # count before the slow call; failures are NOT refunded
            snapshot = copy.deepcopy(self.design)  # render a consistent design, lock released
            duration = int((scenes[target] or {}).get("duration_ms") or 3000)
        times = [0, duration // 2, max(0, duration - 1)] if mode == "video" else None
        try:
            rendered = self._render(snapshot, target, times)
            critique = self._critique(
                list(rendered.get("pngs") or []), mode, list(rendered.get("broken_images") or []),
                (snapshot.get("scenes") or [])[target],  # scene JSON keys the deterministic stub
            )
        except VisualObserveError as e:
            logger.info("studio-graph visual observe failed: %s", e.kind)
            return _visual_error(e.kind if e.kind in _VISUAL_FAILURES else "browser_crash")
        except TimeoutError:
            return _visual_error("timeout")
        except Exception:  # noqa: BLE001 - a render/vision failure must not kill the loop
            logger.info("studio-graph visual observe failed")
            return _visual_error("browser_crash")
        with self._lock:
            self._emit({"action": "observe-visual", "scene": target, "mode": mode})
        return {"mode": mode, "scene": target, "critique": critique}

    def select_scene(self, scene_index: Any) -> dict[str, Any]:
        with self._lock:
            scenes = self.design.get("scenes") or []
            try:
                idx = self._resolve_scene(scene_index)
            except ValueError as e:
                return {"error": str(e)}
            if 0 <= idx < len(scenes):
                self.scene = idx
                self._emit({"action": "select-scene", "scene": self.scene})
                return {"editing_scene": self.scene}
            return {"error": f"scene must be 0..{len(scenes) - 1}; add_scene first for more"}

    def generate_image(self, concept: str) -> dict[str, Any]:
        """Generate ONE static image for a concept and return a ref to place with add-image.

        The agent can no longer generate frame-by-frame sprites (it produced incoherent frames and
        leaned on them for all visuals); it generates a single still and animates it with keyframe
        node transforms (animate-node) instead.
        """
        with self._lock:  # budget check + increment are shared state
            if self.generated >= self._max_generates:
                return {"error": "image-generation budget reached"}
            self.generated += 1
        try:
            handle = self._gen(concept, {})  # outside the lock: slow network gen
        except Exception:  # noqa: BLE001 - a generation failure must not kill the loop
            logger.info("studio-graph image generation failed")
            with self._lock:
                self.generated -= 1  # refund the budget so a retry is possible
            return {"error": "image generation failed"}
        with self._lock:
            self._emit({"action": "generate-image", "ref": handle.get("ref")})
        return handle


def _args_model(tool_name: str, params: dict[str, Any]):
    """Build a pydantic args schema for a studio op from its spec params (typed + required)."""
    fields: dict[str, Any] = {}
    for name, desc in params.items():
        text = str(desc)
        # A scene *target* (the injected `scene`, or observe/select_scene's `scene_index`, both
        # described as "… index or id") must accept EITHER a 0-based index OR a scene id string —
        # the model naturally sends scene=0 as an int, so a str-only field rejected every
        # scene-targeted op and left later scenes empty. `_resolve_scene` handles both forms.
        # Checked before _NUMBER_PARAMS so op-level numeric `scene_index` (e.g. set_scene_duration)
        # stays a plain number.
        is_scene_target = name == "scene" or "or id" in text.lower()
        if name == "node_ids":
            annotation: Any = list[str]
        elif name == "cues":
            annotation = list[dict]
        elif is_scene_target:
            annotation = int | str
        elif name == "image":
            annotation = bool
        elif name in _NUMBER_PARAMS:
            annotation = float
        else:
            annotation = str
        if "optional" in text.lower():
            fields[name] = (annotation | None, Field(default=None, description=text))
        else:
            fields[name] = (annotation, Field(description=text))
    return create_model(f"{tool_name}_args", **fields)


def _safe(fn: Any) -> Any:
    """Wrap a tool body so a bad arg (wrong type, unknown id, apply failure) returns an error the
    model can recover from — never an exception that aborts the WHOLE graph run (one did: the model
    passed select_scene('scene-0') and int() raised, killing the build)."""

    def _wrapped(**kwargs: Any) -> dict[str, Any]:
        try:
            return fn(**kwargs)
        except Exception as e:  # noqa: BLE001 - a single tool error must not crash the build
            logger.info("studio-graph tool error: %s", e)
            return {"error": f"{type(e).__name__}: {e}. Fix the arguments and try again."}

    return _wrapped


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

        # Inject an optional per-op `scene` target. Because ToolNode runs a turn's calls
        # concurrently, relying on select_scene + a mutable cursor is racy for multi-scene builds;
        # letting each op name its own scene makes targeting deterministic regardless of ordering.
        params = dict(op.get("params") or {})
        # Inject the `scene` target only for ops that otherwise act on the *selected* scene.
        # Structural scene-ops already address a scene via their own required param (scene_id /
        # scene_index); injecting a second scene concept made the model pass `scene` and omit the
        # op's own required id (set_scene_duration failed validation on exactly that).
        if not any(k in params for k in ("scene_id", "scene_index")):
            params.setdefault(
                "scene", "optional target scene index or id; defaults to selected scene"
            )
        tools.append(
            StructuredTool.from_function(
                _safe(_make(op_name)),
                name=tool_name,
                description=str(op.get("description", "")),
                args_schema=_args_model(tool_name, params),
            )
        )

    tools.append(
        StructuredTool.from_function(
            _safe(lambda scene_index=None: session.observe(scene_index)),
            name="observe",
            description="Read an accurate word description of the current (or given) scene.",
            args_schema=_args_model("observe", {"scene_index": "optional scene index or id"}),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda scene_index=None, image=None: session.observe_visual(
                scene_index, True if image is None else bool(image)
            )),
            name="observe_visual",
            description=(
                "Costly, budgeted visual review: renders the real scene and returns a vision "
                "critique (image for static scenes, video frames for animated ones). Use `observe` "
                "(cheap text) by default; call this sparingly, e.g. once the scene looks finished. "
                "If it errors, fall back to observe — do not retry."
            ),
            args_schema=_args_model(
                "observe_visual",
                {
                    "scene_index": "optional scene index or id",
                    "image": "optional bool; true (default) auto-picks image/video, false = video",
                },
            ),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda scene_index: session.select_scene(scene_index)),
            name="select_scene",
            description="Switch the scene you edit (by index or scene id; add_scene for reels).",
            args_schema=_args_model("select_scene", {"scene_index": "scene index (0-based) or id"}),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda concept: session.generate_image(concept)),
            name="generate_image",
            description=(
                "Generate ONE static image for a visual concept (a hero backdrop, an illustration, "
                "an icon). Returns a ref — place it with add_image, then give it motion with "
                "animate_node. Use this for custom visuals; use place for approved catalog photos. "
                "There is no sprite generation — build motion from keyframes, not generated frames."
            ),
            args_schema=_args_model(
                "generate_image", {"concept": "what the still image should depict"}
            ),
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
    generate_image_fn: GenerateImageFn,
    scene_index: int = 0,
    max_rounds: int = 24,
    on_step: Any = None,
    render_fn: RenderFn | None = None,
    critique_fn: CritiqueFn | None = None,
    max_visual_observes: int = 3,
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
        design, scene_index, apply_fn, observe_fn, generate_image_fn, on_step,
        render_fn=render_fn, critique_fn=critique_fn, max_visual_observes=max_visual_observes,
    )
    tools = _build_tools(session, spec)
    model = ChatGoogleGenerativeAI(
        model=settings.ai_model, google_api_key=settings.gemini_api_key, temperature=0.4
    )
    width = int(design.get("width") or 1080)
    height = int(design.get("height") or 1080)
    scene_count = len(design.get("scenes") or []) or 1
    agent = create_react_agent(
        model, tools, prompt=_system_prompt(prompt, items, width, height, scene_count)
    )
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
