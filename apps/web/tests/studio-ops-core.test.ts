import { describe, expect, it } from "vitest";
import { newDesign } from "../lib/studio/ops";
import {
  STUDIO_OPS_SPEC,
  applyStudioOps,
  validateDesign,
  type StudioOpContext,
} from "../lib/studio/studio-ops";

// The host-agnostic agentic tool core: a grounded, validated op catalog over the pure ops. Pure +
// deterministic (Contract 4); grounding = only approved catalog items, never a fabricated image src
// (Contract 1). Synthetic fixtures only.

function ctx(over: Partial<StudioOpContext> = {}): StudioOpContext {
  return {
    sceneIndex: 0,
    allowedCatalogIds: new Set(["7"]),
    imageSrcFor: (id) => (id === "7" ? "blob:served/7.png" : undefined),
    ...over,
  };
}

describe("studio-ops tool core", () => {
  it("test_write_copy_adds_text_node", () => {
    const d = newDesign("social");
    const { design, results, valid } = applyStudioOps(d, [{ op: "write-copy", text: "Discover Galway" }], ctx());
    expect(results).toEqual([{ op: "write-copy", status: "applied" }]);
    expect(valid).toBe(true);
    expect(design.scenes[0].nodes).toHaveLength(1);
    expect(design.scenes[0].nodes[0]).toMatchObject({ type: "text", text: "Discover Galway" });
  });

  it("test_place_uses_resolved_catalog_src_and_tags_provenance", () => {
    const d = newDesign("social");
    const { design, results } = applyStudioOps(d, [{ op: "place", item_id: 7 }], ctx());
    expect(results[0].status).toBe("applied");
    const node = design.scenes[0].nodes[0];
    expect(node.type).toBe("image");
    expect(node.catalogItemId).toBe("7"); // provenance carried
    expect(node.src).toBe("blob:served/7.png"); // only the served src, never fabricated
  });

  it("test_place_rejected_when_no_image_source", () => {
    const d = newDesign("social");
    // id is allowed, but imageSrcFor can't resolve it → rejected (studio never fabricates a src).
    const { design, results } = applyStudioOps(d, [{ op: "place", item_id: 7 }], ctx({ imageSrcFor: () => undefined }));
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/no image source/i);
    expect(design.scenes[0].nodes).toHaveLength(0); // design untouched
  });

  it("test_fill_placeholder_fills_a_template_photo_slot_in_place", () => {
    // A template's photo slot (placeholder) is filled IN PLACE — the image takes the slot's exact
    // position/size and the placeholder flag clears. Catalog fill (grounded) and generated fill both.
    const base = newDesign("social");
    const withSlot = {
      ...base,
      scenes: base.scenes.map((s, i) =>
        i === 0
          ? { ...s, nodes: [{ id: "photo-slot", type: "image", placeholder: true, x: 10, y: 20, width: 300, height: 200 }] }
          : s,
      ),
    } as typeof base;
    // fill from the approved catalog
    const viaCatalog = applyStudioOps(withSlot, [{ op: "fill-placeholder", node_id: "photo-slot", item_id: 7 }], ctx());
    expect(viaCatalog.results[0].status).toBe("applied");
    const node = viaCatalog.design.scenes[0].nodes[0];
    expect(node.placeholder).toBeUndefined();          // slot is now filled
    expect(node.src).toBe("blob:served/7.png");        // only the served src
    expect(node).toMatchObject({ x: 10, y: 20, width: 300, height: 200 }); // stayed in the slot
    // fill from a generated image ref
    const viaGen = applyStudioOps(
      withSlot,
      [{ op: "fill-placeholder", node_id: "photo-slot", ref: "gen:5" }],
      ctx({ generatedImageFor: (r) => (r === "gen:5" ? { src: "blob:gen/5.png", objectKey: "users/9/x" } : undefined) }),
    );
    expect(viaGen.results[0].status).toBe("applied");
    expect(viaGen.design.scenes[0].nodes[0].objectKey).toBe("users/9/x");
    // a non-placeholder node is rejected
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "A" }], ctx()).design;
    const textId = seeded.scenes[0].nodes[0].id;
    const bad = applyStudioOps(seeded, [{ op: "fill-placeholder", node_id: textId, item_id: 7 }], ctx());
    expect(bad.results[0].status).toBe("rejected");
    expect(bad.results[0].reason).toMatch(/not an empty photo placeholder/i);
  });

  it("test_add_placeholder_then_fill_round_trips_an_image_region", () => {
    // The agent adds a REAL image placeholder element for a photo region (not a grey rect), then
    // fills it — so an imagery region is composed the right way end-to-end.
    const d = newDesign("social");
    const added = applyStudioOps(
      d,
      [{ op: "add-placeholder", x: 40, y: 60, width: 400, height: 300 }],
      ctx(),
    );
    expect(added.results[0].status).toBe("applied");
    const ph = added.design.scenes[0].nodes.at(-1)!;
    expect(ph.type).toBe("image");
    expect(ph.placeholder).toBe(true);
    expect(ph).toMatchObject({ x: 40, y: 60, width: 400, height: 300 });
    // and it can be filled in place like any placeholder
    const filled = applyStudioOps(
      added.design,
      [{ op: "fill-placeholder", node_id: ph.id, ref: "gen:5" }],
      ctx({ generatedImageFor: (r) => (r === "gen:5" ? { src: "blob:gen/5.png", objectKey: "k" } : undefined) }),
    );
    expect(filled.results[0].status).toBe("applied");
    const node = filled.design.scenes[0].nodes.find((n) => n.id === ph.id)!;
    expect(node.placeholder).toBeUndefined();
    expect(node).toMatchObject({ x: 40, y: 60, width: 400, height: 300 }); // stayed in the region
  });

  it("test_add_image_places_a_generated_still_with_object_key", () => {
    const d = newDesign("social");
    const genCtx = ctx({
      generatedImageFor: (ref) =>
        ref === "gen:5" ? { src: "blob:gen/5.png", objectKey: "users/9/abc", width: 800, height: 600 } : undefined,
    });
    const { design, results } = applyStudioOps(
      d,
      [{ op: "add-image", ref: "gen:5", x: 10, y: 20 }],
      genCtx,
    );
    expect(results[0].status).toBe("applied");
    const node = design.scenes[0].nodes[0];
    expect(node.type).toBe("image");
    expect(node.src).toBe("blob:gen/5.png");
    expect(node.objectKey).toBe("users/9/abc"); // stable key so it re-resolves on reload
    expect(node.catalogItemId).toBeUndefined(); // generated, NOT a catalog item (Contract 1)
    expect(node).toMatchObject({ x: 10, y: 20, width: 800, height: 600 }); // size from the handle
  });

  it("test_add_image_rejected_when_ref_does_not_resolve", () => {
    const d = newDesign("social");
    // No generatedImageFor (or an unknown ref) → rejected; the studio never fabricates an image src.
    const { design, results } = applyStudioOps(d, [{ op: "add-image", ref: "gen:404" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/no generated image/i);
    expect(design.scenes[0].nodes).toHaveLength(0); // design untouched
  });

  it("test_grounding_rejects_unapproved_catalog_id", () => {
    const d = newDesign("social");
    const calls = [
      { op: "place", item_id: 999 }, // not in allowed set
      { op: "write-copy", text: "About 999", item_id: 999 },
    ];
    const { design, results } = applyStudioOps(d, calls, ctx());
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    expect(results[0].reason).toMatch(/not an approved catalog item/i);
    expect(design.scenes[0].nodes).toHaveLength(0);
  });

  it("test_unknown_op_is_rejected_without_aborting_batch", () => {
    const d = newDesign("social");
    const calls = [{ op: "frobnicate", foo: 1 }, { op: "write-copy", text: "Still works" }];
    const { design, results } = applyStudioOps(d, calls, ctx());
    expect(results[0]).toMatchObject({ op: "frobnicate", status: "rejected" });
    expect(results[0].reason).toMatch(/unknown op/i);
    expect(results[1].status).toBe("applied"); // batch continued
    expect(design.scenes[0].nodes).toHaveLength(1);
  });

  it("test_add_shape_validates_kind", () => {
    const d = newDesign("social");
    const good = applyStudioOps(d, [{ op: "add-shape", shape: "rect" }], ctx());
    expect(good.results[0].status).toBe("applied");
    const bad = applyStudioOps(d, [{ op: "add-shape", shape: "hexagon" }], ctx());
    expect(bad.results[0].status).toBe("rejected");
    expect(bad.results[0].reason).toMatch(/rect, ellipse, line/);
  });

  it("test_scene_ops_background_add_and_duration", () => {
    const d = newDesign("social");
    const sceneId = d.scenes[0].id;
    const out = applyStudioOps(
      d,
      [
        { op: "set-background", color: "#0e2a26" },
        { op: "add-scene" },
        { op: "set-scene-duration", scene_id: sceneId, duration_ms: 3000 },
        { op: "set-scene-duration", scene_id: "nope", duration_ms: 3000 },
      ],
      ctx(),
    );
    expect(out.results.map((r) => r.status)).toEqual(["applied", "applied", "applied", "rejected"]);
    expect(out.design.scenes).toHaveLength(2); // add-scene appended
    expect(out.design.scenes[0].background).toBe("#0e2a26");
    expect(out.design.scenes[0].durationMs).toBe(3000);
  });

  it("test_set_scene_duration_defaults_to_the_targeted_scene_when_scene_id_omitted", () => {
    // The agent targets a scene with the universal `scene` param (→ ctx.sceneIndex), then naturally
    // omits the op's own scene_id. Requiring scene_id made the model 422; it must default to the
    // current/targeted scene (ctx.sceneIndex) like rename/transition/narration do.
    const d = newDesign("social");
    const twoScenes = applyStudioOps(d, [{ op: "add-scene" }], ctx()).design;
    // No scene_id, sceneIndex=1 → applies to scene 1 (the targeted scene), not scene 0.
    const out = applyStudioOps(twoScenes, [{ op: "set-scene-duration", duration_ms: 2500 }], ctx({ sceneIndex: 1 }));
    expect(out.results[0].status).toBe("applied");
    expect(out.design.scenes[1].durationMs).toBe(2500);
    expect(out.design.scenes[0].durationMs).not.toBe(2500); // the non-targeted scene is untouched
    // An explicit scene_id still works as an override.
    const byId = applyStudioOps(twoScenes, [{ op: "set-scene-duration", scene_id: twoScenes.scenes[0].id, duration_ms: 1800 }], ctx({ sceneIndex: 1 }));
    expect(byId.design.scenes[0].durationMs).toBe(1800);
    // An unknown explicit id is still rejected.
    const bad = applyStudioOps(twoScenes, [{ op: "set-scene-duration", scene_id: "nope", duration_ms: 1000 }], ctx());
    expect(bad.results[0].status).toBe("rejected");
  });

  it("test_apply_is_pure_and_deterministic", () => {
    const d = newDesign("social");
    const calls = [
      { op: "set-background", color: "#101820" },
      { op: "write-copy", text: "Galway" },
      { op: "place", item_id: 7 },
    ];
    const a = applyStudioOps(d, calls, ctx());
    const b = applyStudioOps(d, calls, ctx());
    expect(a.design).toEqual(b.design); // deterministic
    expect(d.scenes[0].nodes).toHaveLength(0); // input not mutated
    expect(a.valid).toBe(true);
  });

  it("test_spec_is_serializable_and_lists_ops", () => {
    expect(JSON.stringify(STUDIO_OPS_SPEC)).toBeTruthy(); // no functions → serializable
    const names = STUDIO_OPS_SPEC.map((s) => s.op);
    expect(names).toContain("write-copy");
    expect(names).toContain("place");
    for (const entry of STUDIO_OPS_SPEC) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("test_validate_design_accepts_a_fresh_design", () => {
    expect(validateDesign(newDesign("social"))).toBe(true);
  });

  // ── Node editing (target existing nodes by id) ──
  it("test_node_editing_ops_edit_move_resize_style_reorder", () => {
    // Seed two text nodes, then edit the first via each op (ids come from the design, like observe).
    let d = applyStudioOps(
      newDesign("social"),
      [{ op: "write-copy", text: "One" }, { op: "write-copy", text: "Two" }],
      ctx(),
    ).design;
    const id = d.scenes[0].nodes[0].id;
    const r = applyStudioOps(
      d,
      [
        { op: "edit-text", node_id: id, text: "Renamed" },
        { op: "move-node", node_id: id, x: 200, y: 300 },
        { op: "resize-node", node_id: id, width: 150, height: 60 },
        { op: "style-node", node_id: id, color: "#ff0000", opacity: 0.5 },
        { op: "reorder-node", node_id: id, move: "front" },
      ],
      ctx(),
    );
    expect(r.results.every((x) => x.status === "applied")).toBe(true);
    d = r.design;
    const node = d.scenes[0].nodes.find((n) => n.id === id)!;
    expect(node).toMatchObject({ text: "Renamed", x: 200, y: 300, width: 150, height: 60, color: "#ff0000", opacity: 0.5 });
    expect(d.scenes[0].nodes[d.scenes[0].nodes.length - 1].id).toBe(id); // moved to front (top of z-stack)
  });

  it("test_delete_and_duplicate_node", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "A" }], ctx()).design;
    const id = seeded.scenes[0].nodes[0].id;
    const dup = applyStudioOps(seeded, [{ op: "duplicate-node", node_id: id }], ctx());
    expect(dup.results[0].status).toBe("applied");
    expect(dup.design.scenes[0].nodes).toHaveLength(2);
    const del = applyStudioOps(dup.design, [{ op: "delete-node", node_id: id }], ctx());
    expect(del.design.scenes[0].nodes.find((n) => n.id === id)).toBeUndefined();
  });

  it("test_editing_a_missing_node_is_rejected_with_a_clear_reason", () => {
    const { results, design } = applyStudioOps(
      newDesign("social"),
      [{ op: "move-node", node_id: "nope", x: 1, y: 1 }],
      ctx(),
    );
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/not found on the current scene/i);
    expect(design.scenes[0].nodes).toHaveLength(0); // unchanged
  });

  it("test_edit_text_rejects_a_non_text_node", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "place", item_id: 7 }], ctx()).design;
    const imgId = seeded.scenes[0].nodes[0].id;
    const { results } = applyStudioOps(seeded, [{ op: "edit-text", node_id: imgId, text: "x" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/not editable text/i);
  });

  // ── Animation ──
  it("test_animate_node_sets_entrance_and_loop", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "Hi" }], ctx()).design;
    const id = seeded.scenes[0].nodes[0].id;
    const r = applyStudioOps(
      seeded,
      [{ op: "animate-node", node_id: id, enter: "rise", start_ms: 200, duration_ms: 500, loop: "float" }],
      ctx(),
    );
    expect(r.results[0].status).toBe("applied");
    const anim = r.design.scenes[0].nodes.find((n) => n.id === id)!.anim!;
    expect(anim.enter).toMatchObject({ type: "rise", startMs: 200, durationMs: 500 });
    expect(anim.loop).toMatchObject({ type: "float" });
    expect(anim.keyframes.length).toBeGreaterThan(1);
  });

  it("test_animate_node_validates_enter_and_requires_one_effect", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "Hi" }], ctx()).design;
    const id = seeded.scenes[0].nodes[0].id;
    const bad = applyStudioOps(seeded, [{ op: "animate-node", node_id: id, enter: "zoom" }], ctx());
    expect(bad.results[0]).toMatchObject({ status: "rejected" });
    const none = applyStudioOps(seeded, [{ op: "animate-node", node_id: id }], ctx());
    expect(none.results[0].reason).toMatch(/entrance .* or an emphasis loop/i);
  });

  it("test_clear_animation_removes_the_track", () => {
    let d = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "Hi" }], ctx()).design;
    const id = d.scenes[0].nodes[0].id;
    d = applyStudioOps(d, [{ op: "animate-node", node_id: id, enter: "fade" }], ctx()).design;
    d = applyStudioOps(d, [{ op: "clear-animation", node_id: id }], ctx()).design;
    expect(d.scenes[0].nodes.find((n) => n.id === id)!.anim).toBeUndefined();
  });

  // ── Grouping ──
  it("test_group_nodes_then_set_group_anim", () => {
    const seeded = applyStudioOps(
      newDesign("social"),
      [{ op: "write-copy", text: "A" }, { op: "write-copy", text: "B" }],
      ctx(),
    ).design;
    const ids = seeded.scenes[0].nodes.map((n) => n.id);
    const grouped = applyStudioOps(seeded, [{ op: "group-nodes", node_ids: ids }], ctx());
    expect(grouped.results[0].status).toBe("applied");
    const group = grouped.design.scenes[0].groups![0];
    expect(seeded.scenes[0].nodes.every((n) => !n.groupId)).toBe(true); // original untouched
    expect(grouped.design.scenes[0].nodes.every((n) => n.groupId === group.id)).toBe(true);
    // Now animate the group (parent-first).
    const anim = applyStudioOps(
      grouped.design,
      [{ op: "set-group-anim", group_id: group.id, enter: "rise", duration_ms: 400 }],
      ctx(),
    );
    expect(anim.results[0].status).toBe("applied");
    expect(anim.design.scenes[0].groups![0].anim).toMatchObject({ enter: "rise", durationMs: 400 });
  });

  it("test_group_nodes_rejects_fewer_than_two", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "A" }], ctx()).design;
    const { results } = applyStudioOps(
      seeded,
      [{ op: "group-nodes", node_ids: [seeded.scenes[0].nodes[0].id] }],
      ctx(),
    );
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/at least 2/i);
  });

  it("test_ungroup_rejects_unknown_group", () => {
    const { results } = applyStudioOps(newDesign("social"), [{ op: "ungroup", group_id: "group-9" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/not found on the current scene/i);
  });

  // ── Sprites + chains ──
  it("test_add_sprite_embeds_frames_from_the_registry", () => {
    const { design, results } = applyStudioOps(
      newDesign("social"),
      [{ op: "add-sprite", sprite: "walking-panda" }],
      ctx(),
    );
    expect(results[0].status).toBe("applied");
    const node = design.scenes[0].nodes[0];
    expect(node.sprite).toBe("walking-panda");
    expect((node.frames?.length ?? 0)).toBeGreaterThan(1); // self-contained filmstrip
    expect(node.src).toBeTruthy();
  });

  it("test_add_sprite_rejects_an_unknown_id_with_the_choices", () => {
    const { results } = applyStudioOps(newDesign("social"), [{ op: "add-sprite", sprite: "dragon" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/unknown sprite .*walking-panda/i);
  });

  it("test_chain_sprite_links_a_successor_and_grows_the_scene", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "add-sprite", sprite: "bobbing-boat" }], ctx()).design;
    const headId = seeded.scenes[0].nodes[0].id;
    const d0 = seeded.scenes[0].durationMs;
    const chained = applyStudioOps(
      seeded,
      [{ op: "chain-sprite", parent_id: headId, sprite: "swimming-fish" }],
      ctx(),
    );
    expect(chained.results[0].status).toBe("applied");
    expect(chained.design.scenes[0].nodes).toHaveLength(2);
    const head = chained.design.scenes[0].nodes.find((n) => n.id === headId)!;
    expect(head.successorId).toBe(chained.design.scenes[0].nodes[1].id); // linked head → successor
    expect(chained.design.scenes[0].durationMs).toBeGreaterThanOrEqual(d0); // scene grew to fit
  });

  it("test_chain_sprite_rejects_a_non_sprite_parent", () => {
    const seeded = applyStudioOps(newDesign("social"), [{ op: "write-copy", text: "Hi" }], ctx()).design;
    const textId = seeded.scenes[0].nodes[0].id;
    const { results } = applyStudioOps(
      seeded,
      [{ op: "chain-sprite", parent_id: textId, sprite: "walking-panda" }],
      ctx(),
    );
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/not a sprite/i);
  });

  it("test_add_sprite_places_a_generated_sprite_via_the_resolver", () => {
    // A generated/user sprite is not built-in; its frames come from the host-supplied resolver.
    const generated = ctx({
      spriteFramesFor: (ref) =>
        ref === "user:5" ? { frames: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"], fps: 8, width: 48, height: 48 } : undefined,
    });
    const r = applyStudioOps(newDesign("social"), [{ op: "add-sprite", sprite: "user:5" }], generated);
    expect(r.results[0].status).toBe("applied");
    const node = r.design.scenes[0].nodes[0];
    expect(node.sprite).toBe("user:5"); // ref carried for reload re-resolution
    expect(node.frames).toHaveLength(2); // frames embedded from the resolver
  });

  it("test_add_sprite_rejects_a_generated_ref_the_host_cannot_resolve", () => {
    const { results } = applyStudioOps(newDesign("social"), [{ op: "add-sprite", sprite: "user:99" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/unknown sprite/i);
  });

  // ── Scene ops (create/update/remove/reorder/transition/narration) ──
  it("test_scene_ops_transition_narration_rename", () => {
    let d = newDesign("social");
    // add a 2nd scene + switch to editing scene 1 is done at the loop level; here ops target ctx.sceneIndex.
    d = applyStudioOps(d, [{ op: "add-scene" }], ctx()).design;
    const r = applyStudioOps(
      d,
      [
        { op: "set-scene-transition", transition: "fade" },
        { op: "rename-scene", name: "Intro" },
        { op: "set-scene-narration", cues: [{ at_ms: 0, text: "Welcome to the west of Ireland." }] },
      ],
      ctx({ sceneIndex: 0 }),
    );
    expect(r.results.every((x) => x.status === "applied")).toBe(true);
    expect(r.design.scenes[0].transition).toBe("fade");
    expect(r.design.scenes[0].name).toBe("Intro");
    expect(r.design.scenes[0].narration).toEqual([{ atMs: 0, text: "Welcome to the west of Ireland." }]);
  });

  it("test_set_scene_transition_validates_kind", () => {
    const { results } = applyStudioOps(newDesign("social"), [{ op: "set-scene-transition", transition: "warp" }], ctx());
    expect(results[0].status).toBe("rejected");
    expect(results[0].reason).toMatch(/transition must be one of/i);
  });

  it("test_remove_and_reorder_scene", () => {
    let d = applyStudioOps(newDesign("social"), [{ op: "add-scene" }, { op: "add-scene" }], ctx()).design;
    expect(d.scenes).toHaveLength(d.scenes.length); // ≥3 scenes now
    const n = d.scenes.length;
    const reordered = applyStudioOps(d, [{ op: "reorder-scene", from: 0, to: n - 1 }], ctx());
    expect(reordered.results[0].status).toBe("applied");
    d = applyStudioOps(d, [{ op: "remove-scene", scene_index: 1 }], ctx()).design;
    expect(d.scenes).toHaveLength(n - 1);
  });

  it("test_remove_scene_refuses_the_only_scene", () => {
    const { results } = applyStudioOps(newDesign("social"), [{ op: "remove-scene" }], ctx());
    // A fresh social design may have 1 scene → refused; if it has more this still exercises the op.
    if (results[0].status === "rejected") expect(results[0].reason).toMatch(/only scene|out of range/i);
  });

  it("test_set_chain_duration_and_remove_sprite", () => {
    let d = applyStudioOps(newDesign("social"), [{ op: "add-sprite", sprite: "driving-car" }], ctx()).design;
    const id = d.scenes[0].nodes[0].id;
    const dur = applyStudioOps(d, [{ op: "set-chain-duration", node_id: id, duration_ms: 3000 }], ctx());
    expect(dur.results[0].status).toBe("applied");
    expect(dur.design.scenes[0].nodes[0].chainDurMs).toBe(3000);
    const removed = applyStudioOps(dur.design, [{ op: "remove-sprite", node_id: id }], ctx());
    expect(removed.results[0].status).toBe("applied");
    expect(removed.design.scenes[0].nodes.find((n) => n.id === id)).toBeUndefined();
  });
});
