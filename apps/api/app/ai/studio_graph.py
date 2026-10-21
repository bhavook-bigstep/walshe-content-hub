"""The Studio Builder agent as a hand-driven ReAct loop over NATIVE tool calls.

Each Studio op is a real LangChain tool the model function-calls (so every op is a real tool call,
shown natively in LangSmith), plus meta-tools (observe / find_nodes / observe_visual / select_scene
/ generate_image / generate_cutout). The loop is driven HERE (not create_react_agent) so each model
turn and each tool call is its own top-level trace, grouped by a build thread_id — a flat, ordered,
readable run instead of one deep nested tree. The LLM is LangChain's Gemini chat model (via
`_build_model`, a test seam), so the same wiring works for Claude/OpenAI by swapping the model.
Grounding + execution stay server-side: the tools call the injected apply/observe/generate fns
(which enforce Contract 1).

No key → the deterministic stub compose (Contract 4), so tests/dev stay hermetic. Tracing is
automatic via LangSmith when a key is set (configure_langsmith); nothing here logs the API key.
"""

from __future__ import annotations

import copy
import json
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
from app.observability.tracing import trace_span

logger = logging.getLogger("app.ai.studio_graph")

# Params the model should send as numbers (so the op layer doesn't reject a string).
_NUMBER_PARAMS = frozenset(
    {
        "x", "y", "width", "height", "radius", "opacity", "angle", "strokeWidth", "fontSize",
        "lineHeight", "duration_ms", "at_ms", "start_ms", "loop_period_ms", "period_ms", "fps",
        "frames", "scene_index", "from", "to", "template_scene",
    }
)


def _elide_node(node: dict[str, Any]) -> dict[str, Any]:
    """A deep copy of one node's JSON with only non-structural BULK elided so the agent reads the
    real structure, not megabytes: a data-URL / huge image src becomes "<src>", a keyframe/frame
    array becomes its length. Every structural field (id, type, text, x/y/w/h, colour, fontSize,
    placeholder, groupId, …) stays verbatim."""
    n = copy.deepcopy(node)
    for k in ("src", "videoSrc"):
        v = n.get(k)
        if isinstance(v, str) and (v.startswith("data:") or len(v) > 120):
            n[k] = f"<{k}>"
    if isinstance(n.get("frames"), list):
        n["frames"] = f"<{len(n['frames'])} frames>"
    anim = n.get("anim")
    if isinstance(anim, dict) and isinstance(anim.get("keyframes"), list):
        if len(anim["keyframes"]) > 4:
            anim["keyframes"] = f"<{len(anim['keyframes'])} keyframes>"
    return n


def _system_prompt(
    items: list[AgentItem], width: int, height: int, scene_count: int = 1, op_summary: str = "",
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
        else "No catalog photos are approved — but NEVER fake an image region with a plain grey/"
        "blank rectangle. Where the design calls for a photo, add a proper image PLACEHOLDER "
        "element (`add_placeholder`) at the right spot, then FILL it with a generated image "
        "(`generate_image` for a full-frame backdrop/scene, `generate_cutout` for a subject that "
        "sits on top), via `fill_placeholder`. A bold type-led layout is great — but when imagery "
        "belongs, GENERATE it; don't substitute a bare shape.\n"
    )
    # ONE stable system prompt for every mode (kept byte-identical across a run's rounds so the
    # provider can cache this prefix — the variable board-state + TASK ride in the user message).
    # The agent branches on the board state it is told / observes: empty -> create; populated ->
    # revise with minimal targeted edits. Covers a fresh build, a reviewer-fix round, a requested
    # addition, and a single-point change — all the same loop.
    work_mode = (
        "HOW YOU WORK — FIRST call `inspect_project` (scope='project') to see the project's "
        "state (is it blank, or does it already have scenes/content?). READ that and the TASK, "
        "then DECIDE for yourself whether this is a fresh creation or an edit of what's there:\n"
        "• CREATING a new design (the draft is blank, or the TASK describes a new design / new "
        "scenes) → compose fully. START EVERY scene FROM A TEMPLATE for a strong pro base. If the "
        "TASK names a TEMPLATE per scene, `use_template` THAT one onto that scene (it COPIES the "
        "template in — never recompose a template layout by hand); otherwise `list_templates` once "
        "and pick the best fit. THEN ADAPT it to the TASK: rewrite its text to the real content "
        "(`edit_text`), fill its "
        "photo slots (`fill_placeholder`), and FREELY add, restyle, reposition or add new elements "
        "so it truly serves the brief and looks great. The template is your starting scaffold, NOT "
        "a cage — enhance it. If the TASK asks for N scenes, build all N (add_scene) — never stop "
        "after one. If the draft holds unrelated LEFTOVER content, clear it (remove_scene) and "
        "build fresh rather than editing on top of it.\n"
        "• EDITING existing content (the TASK asks to add / fix / move / restyle SPECIFIC "
        "elements already in the draft) → make the SMALLEST targeted edits that do the TASK — "
        "change only the nodes the task names (by id, pass scene=<index>), leaving everything else "
        "UNCHANGED; do NOT rebuild or delete-and-recreate. When the TASK lists reviewer problems, "
        "each has a LOCATION — map it to the node id via `observe` and fix the cause (low "
        "contrast → restyle text/backdrop; overlap → move a node; off-canvas → move it inside).\n"
        "BATCH YOUR WORK: emit MANY tool calls in a SINGLE turn — compose a whole scene at once "
        "(background, every text, every shape), not one element per turn (that is slow and burns "
        "your turn budget). Keep going until the WHOLE task is done (ALL scenes built), then STOP "
        "with a one-line summary.\n\n"
    )
    return (
        "You are the Studio Builder, a senior graphic designer. You work on a multi-scene design "
        "by CALLING tools (each tool is a Design Studio operation). Work efficiently and STOP "
        "(reply with a one-line summary, no tool call) once the TASK is done.\n\n"
        "THE PROJECT MODEL — what you work on (so you understand any project you inspect):\n"
        "A PROJECT is JSON: {format, width, height, scenes[]}. It renders as a short reel — each "
        "SCENE is one frame/slide shown in order.\n"
        "A SCENE = {id, background (hex), durationMs, transition (to the next scene), nodes[]}. "
        "nodes are the visible elements, drawn back-to-front in array order.\n"
        "A NODE = {id (unique, stable — you edit by this), type, x, y, width, height} plus "
        "type-specific fields:\n"
        "  • 'text'  → text, fontSize, fontWeight, fontStyle, textAlign, lineHeight, color.\n"
        "  • 'image' → src + catalogItemId (an approved catalog photo) OR a generated src; "
        "placeholder:true marks an EMPTY photo slot to fill (fill_placeholder).\n"
        "  • 'shape' → shape ('rect'|'ellipse'|'line'), color, stroke/strokeWidth, points.\n"
        "A node may also carry: anim (entrance + keyframes for motion), groupId (scene-group "
        "membership), successorId (a sprite chain). You never write raw JSON — you call tools that "
        "edit it; you READ it with inspect_project (scoped), find_nodes (search), observe "
        "(plain words).\n\n"
        f"{work_mode}"
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
        "5. COLOUR: don't invent hex per node. Pick a curated palette with `list_palettes` that "
        "fits the brief's mood, then `apply_theme` to recolour the scene cohesively (background, "
        "shapes, text, accents by role). style_node a specific node only if needed. Keep text "
        "readable over its background.\n"
        "6. Keep it clean: at most ~6 elements per scene. A tasteful accent shape beats clutter.\n"
        "7. NODE IDS: to edit / style / move / resize / animate / delete a node you MUST use its "
        "EXACT id. Ids are given back to you after every op (the `scene` field lists them, e.g. "
        "`text-node-0(text), shape-node-1(shape)`) and by `observe`. NEVER invent an id like "
        "`text_1` or `shape_5` — a guessed id is rejected and wastes budget. If you don't know an "
        "id, call `observe` first.\n"
        "8. ORDER OF WORK: first COMPOSE the content (background, text, shapes, images) for EVERY "
        "scene; only AFTER a scene's content is in place, add a LITTLE animation (≤1 entrance per "
        "key element, no more). Do not spend your budget animating/restyling a near-empty scene.\n"
        "9. Build each scene in ONE clean pass. Do NOT delete everything and start over — if a "
        "layout is off, MOVE or RESTYLE the existing node (by its real id). Deleting and "
        "rebuilding the same scene wastes budget and leaves other scenes empty.\n"
        f"10. This design has {scene_count} scene(s). The TASK may ask for more — add_scene to "
        "append blank scenes. You MUST give EVERY scene content; never leave a scene empty. To "
        "build a specific scene, pass scene=<index> on each element (e.g. scene=1 targets the "
        "second scene) — this is more reliable than select_scene. Work scene 0, then scene 1, then "
        "scene 2… For a reel, set a transition (set_scene_transition) and, for a voiceover, "
        "narration (set_scene_narration) per scene.\n"
        "11. Reference ONLY the approved item ids below; never invent facts, stats or prices.\n"
        "12. IMAGERY — never leave an empty/grey box where a photo belongs. Place approved catalog "
        "photos with `place`, or fill a template's photo slot with `fill_placeholder`. For a photo "
        "region with no slot, add an image PLACEHOLDER element with `add_placeholder` (a proper "
        "dashed media frame — NOT a plain rectangle) at the right x/y/width/height, then fill it. "
        "For a custom FULL-FRAME visual (a backdrop or scene), call `generate_image`; for a "
        "SUBJECT that sits ON TOP of a background/photo/other elements (a product, mascot, person, "
        "object), call `generate_cutout` (a transparent PNG, no white box); place either with "
        "`add_image` or into a placeholder, then animate with `animate_node`. You CANNOT generate "
        "moving sprites — all motion comes from keyframes (animate_node); `add_sprite` only places "
        "the built-in characters. Generate sparingly (small budget).\n\n"
        + (f"TOOLS (summary — full argument schemas are attached to each tool):\n{op_summary}\n\n"
           if op_summary else "")
        + "Approved catalog item ids (use ONLY these):\n"
        + _catalog_lines(items)
        + "\n\nThe specific TASK for this run is the latest user message below."
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


def _resolve_template(key: str) -> tuple[str | None, dict[str, Any] | None]:
    """Resolve a template reference to (id, workspace), matching by id slug OR display name,
    case-insensitively and ignoring decorative chars like the ▶ marker. The planner names templates
    by their DISPLAY name, but the store is keyed by slug — matching only the slug made the builder
    fail the lookup and recompose the template by hand. This closes that gap."""
    from app.design_templates import TEMPLATE_WORKSPACES

    def norm(s: str) -> str:
        return "".join(ch for ch in str(s).lower() if ch.isalnum())

    k = norm(key)
    if not k:
        return None, None
    for tid, ws in TEMPLATE_WORKSPACES.items():
        name = (ws.get("metadata") or {}).get("name") or ""
        if norm(tid) == k or norm(name) == k:
            return tid, ws
    return None, None


_TEMPLATE_SCALE_KEYS = ("x", "y", "width", "height", "fontSize")


def _scene_from_template(
    tpl_scene: dict[str, Any], tpl_w: int, tpl_h: int, dw: int, dh: int, uid: str
) -> dict[str, Any]:
    """A deep copy of a template scene, uniformly scaled to fit the current canvas (no distortion)
    and with every node id made unique (prefixed by ``uid``) — internal references (groupId,
    successorId, scene groups) are remapped so the re-id can't break animation chains/grouping."""
    import copy

    scene = copy.deepcopy(tpl_scene)
    s = min(dw / max(1, tpl_w), dh / max(1, tpl_h)) or 1.0
    nodes = scene.get("nodes") or []
    idmap: dict[str, str] = {}
    for n in nodes:
        old = str(n.get("id") or f"n{len(idmap)}")
        idmap[old] = f"{uid}-{old}"
        n["id"] = idmap[old]
        for k in _TEMPLATE_SCALE_KEYS:
            v = n.get(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                n[k] = max(8, round(v * s)) if k == "fontSize" else round(v * s, 2)
    for n in nodes:  # remap references after all ids are known
        for ref in ("groupId", "successorId"):
            if n.get(ref) in idmap:
                n[ref] = idmap[n[ref]]
    for g in scene.get("groups") or []:
        if g.get("id") in idmap:
            g["id"] = idmap[g["id"]]
        if g.get("parentId") in idmap:
            g["parentId"] = idmap[g["parentId"]]
    return scene


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
        max_applies: int = 300,
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

    def find_nodes(
        self, scene: Any = None, type: str | None = None, text: str | None = None
    ) -> dict[str, Any]:
        """Look up EXACT node ids by filter so the agent never guesses one. Query the live design by
        scene (index/id; omit = all), node type (text/image/shape/background), and/or a case-
        insensitive text substring. Returns the matching ids + a brief + position."""
        with self._lock:
            scenes = self.design.get("scenes") or []
            if scene is None:
                indices = list(range(len(scenes)))
            else:
                try:
                    indices = [self._resolve_scene(scene)]
                except ValueError as e:
                    return {"error": str(e)}
            needle = (text or "").strip().lower()
            matches: list[dict[str, Any]] = []
            for i in indices:
                if not 0 <= i < len(scenes):
                    continue
                for n in (scenes[i].get("nodes") or []):
                    if type and n.get("type") != type:
                        continue
                    body = str(n.get("text") or "")
                    if needle and needle not in body.lower():
                        continue
                    matches.append({
                        "id": n.get("id"), "scene": i, "type": n.get("type"),
                        "text": body[:60], "x": n.get("x"), "y": n.get("y"),
                    })
                    if len(matches) >= 40:
                        break
            return {"matches": matches}

    def inspect(
        self, scope: str = "project", scene: Any = None, node: str | None = None
    ) -> dict[str, Any]:
        """Explore the live project JSON, SCOPED so the agent reads only what it asks for:
        • scope='project' → the shape: canvas + per-scene {index, id, background, durationMs,
          transition, nodeCount, nodeIds}. Use it first to see if the project is blank or populated.
        • scope='scene' (scene=index/id) → that ONE scene's full JSON (nodes included, bulk elided).
        • scope='node'  (scene + node=id) → that ONE node's full JSON.
        Pairs with find_nodes (search by text/type) and observe (plain-word description)."""
        with self._lock:
            scenes = self.design.get("scenes") or []
            sc = (scope or "project").lower()
            if sc == "project":
                return {
                    "format": self.design.get("format"),
                    "width": self.design.get("width"),
                    "height": self.design.get("height"),
                    "sceneCount": len(scenes),
                    "scenes": [
                        {
                            "index": i,
                            "id": s.get("id"),
                            "background": s.get("background"),
                            "durationMs": s.get("durationMs", s.get("duration_ms")),
                            "transition": s.get("transition"),
                            "nodeCount": len(s.get("nodes") or []),
                            "nodeIds": [n.get("id") for n in (s.get("nodes") or [])][:40],
                        }
                        for i, s in enumerate(scenes)
                    ],
                }
            try:
                idx = self._resolve_scene(scene if scene is not None else self.scene)
            except ValueError as e:
                return {"error": str(e)}
            if not 0 <= idx < len(scenes):
                return {"error": f"scene {idx} out of range (0..{len(scenes) - 1})"}
            s = scenes[idx]
            if sc == "scene":
                return {
                    "scene": idx, "id": s.get("id"), "background": s.get("background"),
                    "durationMs": s.get("durationMs", s.get("duration_ms")),
                    "transition": s.get("transition"),
                    "nodes": [_elide_node(n) for n in (s.get("nodes") or [])],
                }
            if sc == "node":
                for n in s.get("nodes") or []:
                    if str(n.get("id")) == str(node):
                        return {"scene": idx, "node": _elide_node(n)}
                return {"error": f"no node '{node}' in scene {idx} — try scope='scene' to list ids"}
            return {"error": f"unknown scope '{scope}' — use project | scene | node"}

    def list_templates(self) -> dict[str, Any]:
        """The template gallery to START a scene from — professionally laid-out scenes (placed text,
        shapes, photo slots). The agent picks the best fit and `use_template`s it, then fills it."""
        from app.design_templates import TEMPLATE_DESCRIPTIONS, TEMPLATE_WORKSPACES

        dw = int(self.design.get("width") or 1080)
        dh = int(self.design.get("height") or 1080)
        out: list[dict[str, Any]] = []
        for tid, ws in TEMPLATE_WORKSPACES.items():
            meta = ws.get("metadata") or {}
            scenes = ws.get("scenes") or []
            nodes = (scenes[0].get("nodes") if scenes else []) or []
            texts = sum(1 for n in nodes if n.get("type") == "text")
            photos = sum(1 for n in nodes if n.get("type") == "image" and n.get("placeholder"))
            shapes = sum(1 for n in nodes if n.get("type") == "shape")
            out.append({
                "id": tid, "name": meta.get("name"), "format": meta.get("format"),
                "pages": len(scenes),  # multi-page: use_template(template_scene=<1..pages>)
                "fits_canvas": int(meta.get("width") or 0) == dw
                and int(meta.get("height") or 0) == dh,
                "slots": f"{texts} text, {photos} photo, {shapes} shapes",
                "description": TEMPLATE_DESCRIPTIONS.get(tid, ""),
            })
        return {"templates": out}

    def use_template(
        self, template: str, scene: Any = None, template_scene: int = 0
    ) -> dict[str, Any]:
        """COPY a template page onto the target scene as its base (its professional layout + photo
        slots, scaled to fit), REPLACING that scene's content — so you do NOT recompose it by hand.
        ``template`` matches by id OR display name (case-insensitive). ``template_scene`` is the
        1-based page of a multi-page template to copy (page 1 = first; default 1). ``scene`` is the
        target scene in
        the workspace (default the selected one). Then adapt it: edit_text the copy, fill the
        photos, restyle. Returns the scene's new node ids to fill."""
        tid, ws = _resolve_template(template)
        if ws is None:
            return {"error": f"unknown template '{template}' — call list_templates for valid names"}
        with self._lock:
            if self.applied >= self._max_applies:
                return {"error": "edit budget reached — stop and summarise"}
            target = self.scene
            if scene is not None:
                try:
                    target = self._resolve_scene(scene)
                except ValueError as e:
                    return {"error": str(e)}
            scenes = self.design.get("scenes") or []
            if not 0 <= target < len(scenes):
                return {"error": f"target scene must be 0..{len(scenes) - 1}"}
            dw = int(self.design.get("width") or 1080)
            dh = int(self.design.get("height") or 1080)
            meta = ws.get("metadata") or {}
            tpl_scenes = ws.get("scenes") or [{"nodes": []}]
            # template_scene is a 1-BASED page number (what the planner emits: "page 2"); 0 or
            # omitted means the first page. Keeps plan, list_templates page count and this aligned.
            try:
                page = int(template_scene)
            except (TypeError, ValueError):
                page = 1
            idx = page - 1 if page >= 1 else 0
            if not 0 <= idx < len(tpl_scenes):
                return {"error": f"template '{tid}' has pages 1..{len(tpl_scenes)}"}
            new = _scene_from_template(
                tpl_scenes[idx], int(meta.get("width") or dw), int(meta.get("height") or dh),
                dw, dh, f"t{self.applied}",
            )
            cur = scenes[target]
            cur["nodes"] = new.get("nodes") or []  # replace content with the template's layout
            if new.get("background"):
                cur["background"] = new["background"]
            if new.get("durationMs"):
                cur["durationMs"] = new["durationMs"]
            self.applied += 1
            self._emit(
                {"action": "use-template", "template": tid, "scene": target},
                design=self.design,
            )
            return {"status": "applied", "template": tid, "page": idx + 1,
                    "scene": _summarize(self.design, target)}

    def list_palettes(self) -> dict[str, Any]:
        """The curated colour palettes to theme a scene with. Each has a mood and four roles
        (bg/surface/ink/accent); pick one that fits the brief, then `apply_theme`."""
        from app.ai.palettes import PALETTES

        return {"palettes": [
            {"id": p["id"], "name": p["name"], "mood": p["mood"],
             "bg": p["bg"], "accent": p["accent"]}
            for p in PALETTES
        ]}

    def apply_theme(self, palette: str, scene: Any = None) -> dict[str, Any]:
        """Recolour a scene with a curated palette (by role: background, large shapes/scrims, text,
        accents) so the colours stay cohesive and readable — instead of inventing hex per node. Pick
        the palette from `list_palettes`. Fine-tune individual nodes afterwards with style_node."""
        from app.ai.palettes import palette_by_id, recolor_scene

        pal = palette_by_id(str(palette))
        if pal is None:
            return {"error": f"unknown palette '{palette}' — call list_palettes for valid ids"}
        with self._lock:
            if self.applied >= self._max_applies:
                return {"error": "edit budget reached — stop and summarise"}
            target = self.scene
            if scene is not None:
                try:
                    target = self._resolve_scene(scene)
                except ValueError as e:
                    return {"error": str(e)}
            scenes = self.design.get("scenes") or []
            if not 0 <= target < len(scenes):
                return {"error": f"scene must be 0..{len(scenes) - 1}"}
            area = int(self.design.get("width") or 1080) * int(self.design.get("height") or 1080)
            recolor_scene(scenes[target], pal, area)
            self.applied += 1
            self._emit(
                {"action": "apply-theme", "palette": pal["id"], "scene": target},
                design=self.design,
            )
            return {"status": "applied", "palette": pal["id"],
                    "scene": _summarize(self.design, target)}

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

    def generate_image(self, concept: str, cutout: bool = False) -> dict[str, Any]:
        """Generate ONE static image for a concept and return a ref to place with add-image.

        The agent can no longer generate frame-by-frame sprites (it produced incoherent frames and
        leaned on them for all visuals); it generates a single still and animates it with keyframe
        node transforms (animate-node) instead. ``cutout`` asks for a transparent PNG (the model
        draws on a solid white bg, which is keyed out) so the subject layers cleanly over others.
        """
        with self._lock:  # budget check + increment are shared state
            if self.generated >= self._max_generates:
                return {"error": "image-generation budget reached"}
            self.generated += 1
        # Image models bake requested/incidental text as GARBLED nonsense (a headline once rendered
        # as "MEME RIONOD"). Force a text-free image — ALL copy is real editable text nodes on the
        # canvas, laid over the image, never inside it.
        hardened = (
            f"{concept.strip()}. Do NOT render any text, words, letters, numbers, captions, "
            "labels, logos or watermarks anywhere in the image."
        )
        try:
            handle = self._gen(hardened, {"cutout": cutout})  # outside the lock: slow network gen
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
            _safe(
                lambda scope="project", scene=None, node=None: session.inspect(scope, scene, node)
            ),
            name="inspect_project",
            description=(
                "Explore the live PROJECT JSON, scoped (read only what you ask for). "
                "scope='project': the shape — canvas + each scene's id, background, duration, "
                "transition, node count and node ids (call this FIRST to see if the project is "
                "blank or populated). scope='scene' (scene=index/id): that one scene's full JSON "
                "with its nodes. scope='node' (scene + node=id): that one node's full JSON. Use it "
                "to understand state and get exact ids before editing."
            ),
            args_schema=_args_model("inspect_project", {
                "scope": "project | scene | node (default project)",
                "scene": "scene index or id (for scope=scene/node)",
                "node": "node id (for scope=node)",
            }),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda scene=None, type=None, text=None: session.find_nodes(scene, type, text)),
            name="find_nodes",
            description=(
                "Look up EXACT node ids to edit/style/move/animate — never guess an id. Filter by "
                "scene (index or id; omit = all), type (text/image/shape), and/or a text substring "
                "(e.g. the headline: type='text', text='adventure'). Returns ids + brief + pos."
            ),
            args_schema=_args_model("find_nodes", {
                "scene": "optional scene index or id to search",
                "type": "optional node type: text | image | shape",
                "text": "optional case-insensitive substring to match in a node's text",
            }),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda: session.list_templates()),
            name="list_templates",
            description=(
                "List the professionally-designed templates to START a scene from (name, format, "
                "slot counts, description, whether it fits the canvas). Pick the best fit for the "
                "scene's purpose, then call use_template. ALWAYS start a scene from a template."
            ),
            args_schema=_args_model("list_templates", {}),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(
                lambda template, scene=None, template_scene=0: session.use_template(
                    template, scene, template_scene
                )
            ),
            name="use_template",
            description=(
                "COPY a template page onto a target scene as its base (layout + photo slots, "
                "scaled to fit), REPLACING that scene's content — do NOT recompose a template by "
                "hand, call this. `template` is the id OR display name from list_templates. "
                "`template_scene` is the 1-based page of a multi-page template (default 1). "
                "`scene` is "
                "the target scene in the workspace. Then ADAPT it: edit_text the copy, "
                "fill_placeholder the photos, restyle. A scaffold to enhance. Returns new node ids."
            ),
            args_schema=_args_model("use_template", {
                "template": "the template id OR display name from list_templates",
                "template_scene": "optional 1-based page of the template to copy (default 1)",
                "scene": "optional target scene index or id; defaults to the current scene",
            }),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda: session.list_palettes()),
            name="list_palettes",
            description=(
                "List curated colour palettes (id, mood, bg + accent swatches) to theme a scene. "
                "Pick one that matches the brief's mood, then apply_theme."
            ),
            args_schema=_args_model("list_palettes", {}),
        )
    )
    tools.append(
        StructuredTool.from_function(
            _safe(lambda palette, scene=None: session.apply_theme(palette, scene)),
            name="apply_theme",
            description=(
                "Recolour a scene with a curated palette (by role: background, shapes/scrims, "
                "text, accents) so colours stay cohesive + readable — never invent hex. Apply "
                "after composing a scene; fine-tune specific nodes with style_node afterwards."
            ),
            args_schema=_args_model("apply_theme", {
                "palette": "the palette id from list_palettes",
                "scene": "optional target scene index or id; defaults to the current scene",
            }),
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
    tools.append(
        StructuredTool.from_function(
            _safe(lambda concept: session.generate_image(concept, cutout=True)),
            name="generate_cutout",
            description=(
                "Generate ONE subject as a TRANSPARENT cut-out PNG (background removed) — e.g. a "
                "product, a mascot, an icon, a person, an object. Returns a ref to place with "
                "add_image. Prefer this over generate_image whenever the image is a SUBJECT that "
                "should sit ON TOP of a background/photo/other elements (no white box around it); "
                "use generate_image for a full-bleed backdrop or scene that fills the frame."
            ),
            args_schema=_args_model(
                "generate_cutout", {"concept": "the subject to depict as a transparent cut-out"}
            ),
        )
    )
    return tools


def _op_summary(tools: list[Any]) -> str:
    """A compact op index — tool name + the first line of its description. Goes in the STABLE system
    prefix (full arg schemas are attached to each tool natively), so it caches run-to-run."""
    lines = []
    for t in tools:
        desc = (getattr(t, "description", "") or "").strip().split("\n")[0]
        lines.append(f"- {getattr(t, 'name', '?')}: {desc[:100]}")
    return "\n".join(lines)


def _text_of(message: Any) -> str:
    """The assistant text of one AIMessage — fed into chat_history so a follow-up run continues the
    thread. Bounded; tolerant of str or multi-part (list-of-dict) message content."""
    try:
        content = getattr(message, "content", None)
        if isinstance(content, str):
            return content.strip()[:600]
        parts = [p.get("text", "") for p in (content or []) if isinstance(p, dict)]
        return " ".join(parts).strip()[:600]
    except Exception:  # noqa: BLE001 - history is best-effort; never fail a build over it
        return ""


def _build_model(settings: Settings) -> Any:
    """The chat model, behind a seam so the hand-driven loop can be tested with a fake model (no
    network). Swapped in tests via monkeypatch; real runs get Gemini."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=settings.ai_model, google_api_key=settings.gemini_api_key, temperature=0.4
    )


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
    history: list[tuple[str, str]] | None = None,
    thread_id: str | None = None,
    run_name: str = "studio-build",
    cancel_check: Any = None,
) -> StudioAgentResult:
    """Run the hand-driven ReAct builder and return the edited design + step transcript.

    The loop is driven here (not create_react_agent) so each model turn and each tool call is its
    own top-level trace, grouped by `thread_id`. No Gemini key → the deterministic stub compose
    (Contract 4). A provider/loop error after some edits returns what was built; before any edit, it
    falls back to the stub so a build always yields something.
    """
    if (settings.ai_provider or "").lower() != "gemini" or not settings.gemini_api_key:
        return _deterministic_compose(design, prompt, items, scene_index, apply_fn, on_step)

    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

    session = _BuilderSession(
        design, scene_index, apply_fn, observe_fn, generate_image_fn, on_step,
        render_fn=render_fn, critique_fn=critique_fn, max_visual_observes=max_visual_observes,
    )
    tools = _build_tools(session, spec)
    tool_by_name = {t.name: t for t in tools}
    llm = _build_model(settings).bind_tools(tools)
    width = int(design.get("width") or 1080)
    height = int(design.get("height") or 1080)
    scene_count = len(design.get("scenes") or []) or 1
    # Cache-friendly running prompt: a STABLE system prefix (guidance + tool summary + grounding)
    # that stays byte-identical across a run's rounds, then {chat_history}, then the variable NEW
    # INPUT (board state + the TASK). Only the suffix changes round-to-round, so the prefix caches.
    sys_prompt = _system_prompt(items, width, height, scene_count, op_summary=_op_summary(tools))
    # No state blob is injected: the agent inspects the live project itself with `inspect_project`
    # (scoped) / observe / find_nodes and decides create-vs-edit. Keeps the input lean + cacheable.
    new_input = f"TASK:\n{prompt.strip()}"
    msgs: list[Any] = [SystemMessage(content=sys_prompt)]
    for role, text in history or []:
        msgs.append(HumanMessage(content=text) if role == "user" else AIMessage(content=text))
    msgs.append(HumanMessage(content=new_input))

    # Hand-driven ReAct loop (not create_react_agent) so EACH model turn and EACH tool call is its
    # own top-level LangSmith trace, grouped by the build's shared thread_id — a flat, ordered,
    # readable run instead of one deep nested tree. Tool calls run sequentially (the session lock
    # stays as defence in depth). A tool's arg-validation error is fed back as its result so the
    # model self-corrects instead of the whole run aborting.
    ls = settings.langsmith_enabled()
    meta = {"session_id": thread_id, "thread_id": thread_id} if thread_id else None
    summary = ""
    try:
        for turn in range(1, max(2, max_rounds) + 1):
            if cancel_check is not None and cancel_check():
                break  # the user stopped the build — leave what's been applied so far
            with trace_span(f"{run_name} · turn {turn}", enabled=ls, metadata=meta):
                ai = llm.invoke(msgs)
            msgs.append(ai)
            calls = getattr(ai, "tool_calls", None) or []
            if not calls:
                summary = _text_of(ai)
                break
            for tc in calls:
                name = tc.get("name") or ""
                tool = tool_by_name.get(name)
                with trace_span(f"tool:{name or '?'}", enabled=ls, metadata=meta):
                    if tool is None:
                        result: Any = {"error": f"unknown tool {name}"}
                    else:
                        try:
                            result = tool.invoke(tc.get("args") or {})
                        except Exception as e:  # noqa: BLE001 - bad args → feed back, don't abort
                            result = {"error": f"{type(e).__name__}: {e}. Fix the arguments."}
                msgs.append(ToolMessage(
                    content=json.dumps(result, default=str)[:4000],
                    tool_call_id=str(tc.get("id") or name),
                    name=name or "tool",
                ))
            if session.applied >= session._max_applies:
                break  # edit budget spent — stop looping even if the model wants more
    except Exception:  # noqa: BLE001 - any model/loop error degrades gracefully
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
        finished=True, provider="gemini", summary=summary,
    )
