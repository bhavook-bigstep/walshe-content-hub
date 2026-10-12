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
});
