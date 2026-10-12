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
});
