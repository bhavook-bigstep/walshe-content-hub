"""Studio Builder graph (LangGraph ReAct) — the session that the tool calls act on.

LangGraph's ToolNode runs a turn's tool calls CONCURRENTLY (sync tools in a thread pool). Each op is
a read-modify-write of the shared design, so without serialisation parallel calls all read the same
base and the last write wins — edits vanish (observed live: 10 write-copy -> 1 node). These tests
pin the fix: _BuilderSession serialises its mutations, so every concurrent op persists. Hermetic —
a fake apply_fn stands in for the Node ops engine; no network.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.ai.studio_agent import VisualObserveError
from app.ai.studio_graph import (
    _args_model,
    _build_tools,
    _BuilderSession,
    _elide_node,
    _safe,
    _scene_is_animated,
)


def _append_apply_fn(design: dict[str, Any], calls: list[dict[str, Any]], scene: int) -> dict:
    """Mirror the real ops engine's add-node semantics: push one node per call, purely."""
    new = {**design, "scenes": [dict(s) for s in design["scenes"]]}
    sc = new["scenes"][scene]
    sc["nodes"] = list(sc.get("nodes", [])) + [{"op": calls[0]["op"]}]
    return {
        "design": new,
        "results": [{"op": calls[0]["op"], "status": "applied"}],
        "valid": True,
    }


def _session(**kw: Any) -> _BuilderSession:
    design = {"scenes": [{"id": "s1", "nodes": []}]}
    return _BuilderSession(
        design, 0, _append_apply_fn, lambda d, s: {"ok": True}, lambda c, o: {}, None, **kw
    )


def test_inspect_project_is_scoped_project_scene_node():
    # The agent explores the live JSON itself, scoped: project overview → one scene → one node.
    design = {
        "format": "social", "width": 1080, "height": 1080,
        "scenes": [
            {"id": "s0", "background": "#111", "durationMs": 3000, "nodes": [
                {"id": "title", "type": "text", "text": "Hi", "x": 10, "y": 20},
                {"id": "photo", "type": "image", "placeholder": True, "x": 0, "y": 0},
            ]},
            {"id": "s1", "nodes": []},
        ],
    }
    sess = _BuilderSession(
        design, 0, _append_apply_fn, lambda d, s: {"ok": True}, lambda c, o: {}, None,
    )
    proj = sess.inspect("project")
    assert proj["sceneCount"] == 2
    assert proj["scenes"][0]["nodeCount"] == 2
    assert proj["scenes"][0]["nodeIds"] == ["title", "photo"]
    assert proj["scenes"][1]["nodeCount"] == 0  # blank scene visible as empty, not hidden

    scene = sess.inspect("scene", scene="s0")  # resolve by id
    assert scene["scene"] == 0 and [n["id"] for n in scene["nodes"]] == ["title", "photo"]

    node = sess.inspect("node", scene=0, node="photo")
    assert node["node"]["placeholder"] is True
    assert "error" in sess.inspect("node", scene=0, node="nope")


def test_elide_node_keeps_structure_drops_bulk():
    # Structural fields stay; only heavy src/keyframe bulk is elided so the agent reads real layout.
    n = _elide_node({
        "id": "img", "type": "image", "x": 5, "y": 6, "width": 100,
        "src": "data:image/png;base64," + "A" * 5000,
        "anim": {"enter": "fade", "keyframes": [{"t": i} for i in range(50)]},
    })
    assert n["id"] == "img" and n["x"] == 5 and n["width"] == 100  # structure intact
    assert n["src"] == "<src>"                                     # base64 bulk gone
    assert n["anim"]["keyframes"] == "<50 keyframes>" and n["anim"]["enter"] == "fade"


def test_concurrent_ops_do_not_clobber_each_other():
    # 20 ops fired in parallel, exactly like ToolNode runs a turn's tool calls. Every one must land.
    sess = _session(max_applies=100)
    with ThreadPoolExecutor(max_workers=20) as ex:
        list(ex.map(lambda i: sess.run_op("write-copy", {"text": f"t{i}"}), range(20)))
    assert len(sess.design["scenes"][0]["nodes"]) == 20  # no lost writes
    assert sess.applied == 20


def test_sequential_ops_thread_the_design():
    # Each op builds on the previous design, so the scene accumulates (not resets to one node).
    sess = _session()
    sess.run_op("set-background", {"color": "#111"})
    sess.run_op("write-copy", {"text": "Headline"})
    sess.run_op("write-copy", {"text": "Subhead"})
    assert len(sess.design["scenes"][0]["nodes"]) == 3


def test_edit_budget_caps_applies_atomically():
    # The budget check is inside the lock, so parallel ops can't overshoot it.
    sess = _session(max_applies=5)
    with ThreadPoolExecutor(max_workers=10) as ex:
        results = list(ex.map(lambda i: sess.run_op("add-shape", {"shape": "rect"}), range(10)))
    assert sess.applied == 5
    assert len(sess.design["scenes"][0]["nodes"]) == 5
    assert sum(1 for r in results if r.get("error")) == 5  # the other 5 hit the budget


def test_op_can_target_any_scene_via_scene_param():
    # Each op may name its own scene (index or id), so multi-scene builds don't depend on a mutable
    # cursor + concurrent-call ordering. The agent looped on scene 0 and left scenes 1/2 empty.
    design = {"scenes": [{"id": "scene-0", "nodes": []}, {"id": "scene-1", "nodes": []},
                         {"id": "scene-2", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None,
                           max_applies=50)
    sess.run_op("write-copy", {"text": "A", "scene": 0})
    sess.run_op("write-copy", {"text": "B", "scene": "scene-1"})  # by id
    sess.run_op("add-shape", {"shape": "rect", "scene": 2})  # by index
    counts = [len(s["nodes"]) for s in sess.design["scenes"]]
    assert counts == [1, 1, 1]  # every scene got its element — none left empty


def test_scene_param_is_stripped_from_the_engine_call():
    captured: dict[str, Any] = {}

    def apply_capture(design: dict[str, Any], calls: list[dict[str, Any]], scene: int) -> dict:
        captured["call"] = calls[0]
        captured["scene"] = scene
        return _append_apply_fn(design, calls, scene)

    design = {"scenes": [{"id": "s0", "nodes": []}, {"id": "s1", "nodes": []}]}
    sess = _BuilderSession(design, 0, apply_capture, lambda d, i: {}, lambda c, o: {}, None)
    sess.run_op("set-background", {"color": "#111", "scene": 1})
    assert captured["scene"] == 1  # routed to the named scene
    assert "scene" not in captured["call"]  # the meta-param never reaches the studio op
    assert captured["call"] == {"op": "set-background", "color": "#111"}


def test_op_with_bad_scene_param_errors_without_applying():
    design = {"scenes": [{"id": "s0", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    out = sess.run_op("write-copy", {"text": "x", "scene": "nope"})
    assert "error" in out
    assert sess.applied == 0  # nothing applied on an unresolvable target


def test_select_scene_accepts_a_scene_id_string():
    # The model routinely passes the scene's id (e.g. "scene-1") not its index. A strict int()
    # raised ValueError and aborted the WHOLE graph run — this must resolve, not crash.
    design = {"scenes": [{"id": "scene-0", "nodes": []}, {"id": "scene-1", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    assert sess.select_scene("scene-1") == {"editing_scene": 1}  # id string
    assert sess.select_scene(0) == {"editing_scene": 0}  # int index
    assert sess.select_scene("0") == {"editing_scene": 0}  # numeric string
    assert "error" in sess.select_scene("nope")  # unknown id -> recoverable error, no raise


def test_safe_wrapper_turns_a_raise_into_a_recoverable_error():
    def boom(**kwargs: Any) -> dict[str, Any]:
        raise ValueError("invalid literal for int() with base 10: 'scene-0'")

    out = _safe(boom)(scene_index="scene-0")  # must NOT propagate — would kill the build
    assert "error" in out and "ValueError" in out["error"]


def test_observe_falls_back_to_current_scene_on_a_bad_ref():
    design = {"scenes": [{"id": "scene-0", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {"scene": i}, lambda c, o: {},
                           None)
    assert sess.observe("bogus-id") == {"scene": 0}  # never fails; uses the current scene


def test_scene_target_arg_schema_accepts_an_int_index():
    # The model sends scene=0 as an INT. A str-only field rejected every scene-targeted op at
    # pydantic validation (before the body ran), so scenes 1..N silently got no elements. The
    # injected `scene` param must accept an int index AND a scene-id string.
    model = _args_model("animate_node", {
        "node_id": "the node",
        "scene": "optional target scene index or id; defaults to selected scene",
    })
    assert model(node_id="text-1", scene=5).scene == 5  # int index — was rejected before the fix
    assert model(node_id="text-1", scene="scene-0").scene == "scene-0"  # id string
    assert model(node_id="text-1").scene is None  # optional — omitting it is fine


def test_select_scene_arg_schema_accepts_int_and_id():
    model = _args_model("select_scene", {"scene_index": "scene index (0-based) or id"})
    assert model(scene_index=2).scene_index == 2  # int index
    assert model(scene_index="scene-1").scene_index == "scene-1"  # id string


def test_set_scene_duration_scene_id_is_optional():
    # set_scene_duration used to REQUIRE scene_id, so when the model targeted via the universal
    # `scene` param and omitted scene_id, pydantic 422'd before run_op could pop `scene`. The op's
    # `scene_id` is now optional (defaults to the targeted scene in the TS op) — omitting it is OK.
    model = _args_model("set_scene_duration", {
        "duration_ms": "milliseconds",
        "scene_id": "optional the scene's id (defaults to the current/targeted scene)",
    })
    assert model(duration_ms=3000).scene_id is None  # omitting scene_id no longer 422s
    assert model(duration_ms=3000, scene_id="scene-1").scene_id == "scene-1"  # explicit override


def test_op_level_numeric_params_stay_numbers():
    # A genuine numeric op param (not a scene target) must still coerce to a number, so the Node
    # ops engine never receives a stray string. "or id" keys the scene-ref widening, nothing else.
    model = _args_model(
        "set_scene_duration", {"scene_index": "scene number", "duration_ms": "duration"}
    )
    inst = model(scene_index=1, duration_ms=1500)
    assert inst.scene_index == 1.0 and inst.duration_ms == 1500.0


def test_scene_target_not_injected_onto_structural_scene_ops():
    # A scene-op that already addresses a scene by its own required param (scene_id / scene_index)
    # must NOT also get the injected optional `scene` — the duplicate made the model pass `scene`
    # and omit the op's required id (set_scene_duration failed validation). Node/content ops still
    # get `scene` so multi-scene targeting keeps working.
    sess = _session()
    spec = [
        {"op": "set-scene-duration", "params": {"scene_id": "the scene's id", "duration_ms": "ms"}},
        {"op": "remove-scene", "params": {"scene_index": "index to remove"}},
        {"op": "write-copy", "params": {"text": "the text"}},
    ]
    tools = {t.name: t for t in _build_tools(sess, spec)}
    assert "scene" not in tools["set_scene_duration"].args  # own scene_id wins; no duplicate
    assert "scene" not in tools["remove_scene"].args  # own scene_index wins
    assert "scene" in tools["write_copy"].args  # content op keeps the target


def test_agent_generates_static_images_not_sprites():
    # The agent must no longer be able to generate frame-by-frame sprites (it produced incoherent
    # frames); it gets ONE static-image generator and places it with add-image, animating via
    # keyframes. Built-in sprite placement (add_sprite) stays.
    sess = _session()
    spec = [{"op": "add-sprite", "params": {"sprite": "x"}}]
    tools = {t.name: t for t in _build_tools(sess, spec)}
    assert "generate_image" in tools
    assert "generate_sprite" not in tools  # the multi-frame generator is gone
    assert "add_sprite" in tools  # built-in sprites still placeable
    assert set(tools["generate_image"].args) == {"concept"}  # single still; no frames param


def test_generate_image_returns_handle_and_respects_budget():
    calls: list[str] = []

    def gen(concept: str, opts: dict[str, Any]) -> dict[str, Any]:
        calls.append(concept)
        return {"ref": f"gen:{len(calls)}", "object_key": "k", "width": 512, "height": 512}

    design = {"scenes": [{"id": "s0", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, gen, None, max_generates=2)
    assert sess.generate_image("a sunset")["ref"] == "gen:1"
    assert sess.generate_image("a map")["ref"] == "gen:2"
    assert "error" in sess.generate_image("one too many")  # budget of 2 enforced
    assert len(calls) == 2  # the over-budget call never hit the generator
    # each concept is hardened against baked-in text (the "MEME RIONOD" garble) but keeps the brief
    assert calls[0].startswith("a sunset") and calls[1].startswith("a map")
    assert all("Do NOT render any text" in c for c in calls)


def test_generate_image_failure_refunds_budget():
    def boom(concept: str, opts: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("provider down")

    design = {"scenes": [{"id": "s0", "nodes": []}]}
    sess = _BuilderSession(
        design, 0, _append_apply_fn, lambda d, i: {}, boom, None, max_generates=1
    )
    assert "error" in sess.generate_image("x")
    assert sess.generated == 0  # a failed generation refunds the budget so a retry is possible


def test_hand_driven_loop_drives_tools_then_stops():
    # The build loop is hand-driven (not create_react_agent) so each turn/tool is its own trace.
    # Hermetic: a fake model scripts one tool-calling turn then a final message; no network, no
    # LangSmith. Asserts the loop executes the tool calls (applies land) and stops on the final msg.
    from langchain_core.messages import AIMessage

    import app.ai.studio_graph as sg

    class _FakeModel:
        def __init__(self) -> None:
            self.turn = 0

        def bind_tools(self, _tools: Any) -> Any:
            return self

        def invoke(self, _msgs: Any) -> Any:
            self.turn += 1
            if self.turn == 1:
                return AIMessage(content="", tool_calls=[
                    {"name": "set_background", "args": {"color": "#111"}, "id": "a"},
                    {"name": "write_copy", "args": {"text": "Hello"}, "id": "b"},
                ])
            return AIMessage(content="Done — one scene composed.")

    class _S:
        ai_provider = "gemini"
        gemini_api_key = "k"
        ai_model = "m"

        def langsmith_enabled(self) -> bool:
            return False

    orig = sg._build_model
    sg._build_model = lambda _settings: _FakeModel()
    try:
        out = sg.run_studio_graph(
            settings=_S(), design={"scenes": [{"id": "s0", "nodes": []}]}, prompt="Build it",
            items=[], spec=[{"op": "set-background", "params": {"color": "hex"}},
                            {"op": "write-copy", "params": {"text": "the text"}}],
            apply_fn=_append_apply_fn, observe_fn=lambda d, i: {},
            generate_image_fn=lambda c, o: {}, scene_index=0, max_rounds=4,
        )
    finally:
        sg._build_model = orig
    assert out.provider == "gemini" and out.finished  # ran the real loop, not the stub
    assert out.applied == 2  # both scripted tool calls executed
    assert out.summary.startswith("Done")  # stopped on the final no-tool-call message
    assert len(out.design["scenes"][0]["nodes"]) == 2


def test_hand_driven_loop_stops_on_cancel():
    # A build must stop when the user cancels: the loop checks cancel_check between turns and leaves
    # what it has applied. Fake model never stops on its own; cancel fires after the first turn.
    from langchain_core.messages import AIMessage

    import app.ai.studio_graph as sg

    class _FakeModel:
        def bind_tools(self, _tools: Any) -> Any:
            return self

        def invoke(self, _msgs: Any) -> Any:  # always wants to keep going
            return AIMessage(content="", tool_calls=[
                {"name": "set_background", "args": {"color": "#111"}, "id": "x"},
            ])

    class _S:
        ai_provider = "gemini"
        gemini_api_key = "k"
        ai_model = "m"

        def langsmith_enabled(self) -> bool:
            return False

    checks = {"n": 0}

    def cancel() -> bool:
        checks["n"] += 1
        return checks["n"] > 1  # let the first turn run, cancel before the second

    orig = sg._build_model
    sg._build_model = lambda _settings: _FakeModel()
    try:
        out = sg.run_studio_graph(
            settings=_S(), design={"scenes": [{"id": "s0", "nodes": []}]}, prompt="Build it",
            items=[], spec=[{"op": "set-background", "params": {"color": "hex"}}],
            apply_fn=_append_apply_fn, observe_fn=lambda d, i: {},
            generate_image_fn=lambda c, o: {}, scene_index=0, max_rounds=8, cancel_check=cancel,
        )
    finally:
        sg._build_model = orig
    assert out.applied == 1  # applied the first turn's op, then stopped on cancel (not the budget)


def test_find_nodes_looks_up_exact_ids_by_filter():
    # The agent must look up REAL ids (not guess them). find_nodes filters by scene/type/text and
    # returns the exact node ids, so edit/style/animate ops hit real nodes, not rejections.
    design = {"scenes": [
        {"id": "scene-0", "nodes": [
            {"id": "text-node-0", "type": "text", "text": "Your Next Adventure", "x": 10, "y": 20},
            {"id": "shape-node-0", "type": "shape", "x": 0, "y": 0},
        ]},
        {"id": "scene-1", "nodes": [{"id": "text-node-1", "type": "text", "text": "Book now"}]},
    ]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    # by type within a scene
    out = sess.find_nodes(scene=0, type="text")
    assert [m["id"] for m in out["matches"]] == ["text-node-0"]
    # by text substring (case-insensitive), across all scenes
    hit = sess.find_nodes(text="adventure")
    assert [m["id"] for m in hit["matches"]] == ["text-node-0"]
    # all scenes, all types
    assert len(sess.find_nodes()["matches"]) == 3
    # a bad scene ref is a recoverable error, not a raise
    assert "error" in sess.find_nodes(scene="nope")


def test_list_templates_and_use_template_lays_a_scaffold():
    # The agent starts a scene from a professional template (not from scratch): list_templates shows
    # the gallery; use_template lays one down as the scene base, scaled to fit + re-ided, replacing
    # the scene's content. The agent then adapts it (edit_text / fill_placeholder / restyle).
    design = {"width": 1080, "height": 1080,
              "scenes": [{"id": "s0", "nodes": [{"id": "old", "type": "text", "text": "x"}]}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    lst = sess.list_templates()["templates"]
    assert any(t["id"] == "aegean-minimal" for t in lst)
    assert all({"id", "name", "slots", "format"} <= set(t) for t in lst)

    out = sess.use_template("aegean-minimal", scene=0)
    assert out["status"] == "applied"
    nodes = sess.design["scenes"][0]["nodes"]
    assert len(nodes) > 1                                   # the template's full layout landed
    assert all(str(n["id"]).startswith("t0-") for n in nodes)  # re-ided → collision-free
    assert not any(n["id"] == "old" for n in nodes)         # replaced the scene's prior content
    assert any(n.get("type") == "image" and n.get("placeholder") for n in nodes)  # a photo slot
    # scaled to fit the 1080×1080 canvas (template is 1080×1350 → scaled down, in-bounds)
    assert all(n.get("y", 0) <= 1080 for n in nodes if isinstance(n.get("y"), (int, float)))
    assert "error" in sess.use_template("no-such-template")  # bad id → recoverable error


def test_use_template_resolves_by_display_name_and_picks_a_page():
    # The planner names templates by DISPLAY name; use_template must resolve that (not just the
    # slug), or the builder fails the lookup and recomposes by hand. It also copies a chosen
    # page of a multi-page template into the chosen TARGET scene.
    design = {"width": 1080, "height": 1080,
              "scenes": [{"id": "s0", "nodes": []}, {"id": "s1", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    # by display name (with the decorative ▶ and spaces), targeting scene 1, page 3 (1-based) of a
    # 3-page reel — page numbering matches what the planner emits ("page 3")
    out = sess.use_template("Destination Reel ▶", scene=1, template_scene=3)
    assert out["status"] == "applied" and out["template"] == "destination-reel"
    assert out["page"] == 3
    assert sess.design["scenes"][1]["nodes"] and not sess.design["scenes"][0]["nodes"]
    # page 0 / omitted falls back to the first page (lenient)
    assert sess.use_template("destination-reel", scene=0, template_scene=0)["page"] == 1
    # out-of-range page is a recoverable error, not a crash
    assert "error" in sess.use_template("destination-reel", template_scene=99)


def test_list_palettes_and_apply_theme_recolours_by_role():
    # The agent themes a scene from a curated palette (cohesive, readable) instead of inventing hex.
    # apply_theme recolours by ROLE: bg, large shape/scrim → surface, small shape → accent, neutral
    # text → ink, accent-coloured text → accent.
    nodes = [
        {"id": "title", "type": "text", "color": "#ffffff", "width": 800, "height": 100},  # neutral
        {"id": "eyebrow", "type": "text", "color": "#F4B860", "width": 400, "height": 40},  # accent
        {"id": "scrim", "type": "shape", "color": "#000000", "width": 1000, "height": 500},  # large
        {"id": "rule", "type": "shape", "color": "#F4B860", "width": 120, "height": 10},  # small
    ]
    design = {"width": 1000, "height": 1000,
              "scenes": [{"id": "s0", "background": "#ffffff", "nodes": nodes}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, lambda d, i: {}, lambda c, o: {}, None)
    pals = sess.list_palettes()["palettes"]
    assert any(p["id"] == "midnight-lux" for p in pals)
    assert all({"id", "mood"} <= set(p) for p in pals)

    assert sess.apply_theme("midnight-lux", scene=0)["status"] == "applied"
    sc = sess.design["scenes"][0]
    assert sc["background"] == "#0E1116"                      # bg role
    byid = {n["id"]: n for n in sc["nodes"]}
    assert byid["title"]["color"] == "#F2F4F8"               # neutral text → ink
    assert byid["eyebrow"]["color"] == "#C9A24B"             # accent-coloured text → accent
    assert byid["scrim"]["color"] == "#1A1F27"               # large shape/scrim → surface
    assert byid["rule"]["color"] == "#C9A24B"                # small shape → accent
    assert "error" in sess.apply_theme("no-such-palette")    # bad id → recoverable error


def test_observe_reads_a_consistent_design():
    seen: list = []

    def observe_fn(design: dict[str, Any], scene: int | None) -> dict[str, Any]:
        seen.append(len(design["scenes"][0]["nodes"]))
        return {"nodes": len(design["scenes"][0]["nodes"])}

    design = {"scenes": [{"id": "s1", "nodes": []}]}
    sess = _BuilderSession(design, 0, _append_apply_fn, observe_fn, lambda c, o: {}, None)
    sess.run_op("write-copy", {"text": "a"})
    out = sess.observe()
    assert out["nodes"] == 1 and seen == [1]  # observe sees the applied write, not an empty base


# --- observe_visual (budgeted render + vision critique; boundaries injected) ---

_STATIC = {"id": "s0", "nodes": [{"id": "n"}], "duration_ms": 2000}
_ANIMATED = {"id": "s1", "nodes": [{"id": "n", "keyframes": [{"at_ms": 0}]}], "duration_ms": 2000}


def _vsession(scenes: list[dict[str, Any]], render=None, critique=None, **kw: Any):
    calls: dict[str, list] = {"render": [], "critique": []}

    def default_render(design, scene, times):
        calls["render"].append((scene, times))
        return {"pngs": [b"png"], "width": 10, "height": 10, "broken_images": []}

    def default_critique(pngs, mode, broken, scene=None):
        calls["critique"].append((mode, scene))
        return {"score": 7, "mode": mode}

    sess = _BuilderSession(
        {"scenes": scenes}, 0, _append_apply_fn, lambda d, s: {}, lambda c, o: {}, None,
        render_fn=render or default_render, critique_fn=critique or default_critique, **kw,
    )
    return sess, calls


def test_scene_is_animated_detects_motion_and_transitions():
    assert not _scene_is_animated({"scenes": [_STATIC]}, 0)
    assert _scene_is_animated({"scenes": [_ANIMATED]}, 0)
    assert _scene_is_animated({"scenes": [{"nodes": [], "transition": {"type": "fade"}}]}, 0)
    assert not _scene_is_animated({"scenes": [{"nodes": [], "transition": "none"}]}, 0)
    assert not _scene_is_animated({"scenes": [_STATIC]}, 5)  # out of range


def test_observe_visual_selects_image_vs_video_mode():
    sess, calls = _vsession([_STATIC, _ANIMATED])
    still = sess.observe_visual(0)
    assert still["mode"] == "image" and calls["render"][0] == (0, None)  # single still
    video = sess.observe_visual(1)
    assert video["mode"] == "video" and calls["render"][1][1] == [0, 1000, 1999]  # sampled frames
    # mode + the scene JSON that keys the deterministic stub (the scene, not pixels) are passed.
    assert calls["critique"] == [("image", _STATIC), ("video", _ANIMATED)]


def test_observe_visual_no_animation_fallback_for_explicit_video():
    sess, calls = _vsession([_STATIC])
    out = sess.observe_visual(0, image=False)
    assert out["reason"] == "no_animation" and "observe" in out["error"]
    assert calls["render"] == [] and sess.visual_observes == 0  # nothing spent


def test_observe_visual_budget_cap():
    sess, calls = _vsession([_STATIC], max_visual_observes=2)
    assert "critique" in sess.observe_visual(0) and "critique" in sess.observe_visual(0)
    out = sess.observe_visual(0)
    assert out["reason"] == "budget_exhausted"
    assert len(calls["render"]) == 2  # over-budget call never rendered


def test_observe_visual_failures_return_actionable_strings():
    def raiser(exc: Exception):
        def _r(design, scene, times):
            raise exc

        return _r

    cases = [
        (VisualObserveError("timeout"), "timeout"),
        (VisualObserveError("bad_workspace"), "bad_workspace"),
        (VisualObserveError("browser_crash"), "browser_crash"),
        (TimeoutError(), "timeout"),
        (RuntimeError("chromium died"), "browser_crash"),
    ]
    for exc, reason in cases:
        sess, _ = _vsession([_STATIC], render=raiser(exc))
        out = sess.observe_visual(0)
        assert out["reason"] == reason and "observe" in out["error"]
        assert sess.visual_observes == 1  # failure still spends budget -> no retry loop


def test_observe_visual_critique_failure_and_missing_capability():
    def bad_critique(pngs, mode, broken, scene=None):
        raise VisualObserveError("timeout")

    sess, _ = _vsession([_STATIC], critique=bad_critique)
    assert sess.observe_visual(0)["reason"] == "timeout"
    bare = _session()  # no render/critique injected -> safe default, not a crash
    assert "error" in bare.observe_visual()
    assert "error" in sess.observe_visual("nope")  # unresolvable scene


def test_observe_visual_tool_registered_alongside_observe():
    sess, _ = _vsession([_STATIC])
    tools = {t.name: t for t in _build_tools(sess, [])}
    assert "observe" in tools and "observe_visual" in tools
    out = tools["observe_visual"].invoke({"scene_index": 0})
    assert out["mode"] == "image"


def test_observe_visual_runs_render_outside_the_lock():
    holder: dict[str, Any] = {}

    def render(design, scene, times):
        holder["free"] = holder["sess"]._lock.acquire(blocking=False)  # lock must NOT be held
        if holder["free"]:
            holder["sess"]._lock.release()
        return {"pngs": []}

    sess, _ = _vsession([_STATIC], render=render)
    holder["sess"] = sess
    sess.observe_visual(0)
    assert holder["free"] is True


def test_concurrent_observe_visual_respects_budget():
    count = 0
    guard = threading.Lock()

    def render(design, scene, times):
        nonlocal count
        with guard:
            count += 1
        return {"pngs": []}

    sess, _ = _vsession([_STATIC], render=render, max_visual_observes=4)
    with ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(lambda i: sess.observe_visual(0), range(16)))
    assert sess.visual_observes == 4 and count == 4  # no overshoot under contention
    assert sum(1 for r in results if r.get("reason") == "budget_exhausted") == 12
    assert len(sess.steps) == 4  # one emitted step per successful observe
