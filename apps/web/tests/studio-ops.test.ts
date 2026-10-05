import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_DURATION_MS,
  DEFAULT_TRANSITION,
  MAX_SCENE_DURATION_MS,
  MIN_SCENE_DURATION_MS,
  addCatalogImage,
  addScene,
  addShape,
  addText,
  clampSceneDuration,
  deleteNode,
  editText,
  migrateDesign,
  moveNode,
  newDesign,
  removeScene,
  renameScene,
  reorderScene,
  resizeNode,
  scenesAsPages,
  setBackground,
  setSceneDuration,
  setSceneTransition,
  type DesignDoc,
} from "../lib/studio/ops";

// AC9 — Manual mode: add/move/resize/edit text, shapes, backgrounds, and catalog images;
// multi-scene for pamphlets. Proof node-id: `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design`.
describe("studio manual ops", () => {
  it("test_manual_ops_mutate_design", () => {
    // A social design starts single-scene and empty.
    const base = newDesign("social");
    expect(base.scenes).toHaveLength(1);
    expect(base.scenes[0].nodes).toHaveLength(0);

    // Each op produces the expected design node.
    const withText = addText(base, 0, "Discover Galway");
    expect(withText.scenes[0].nodes[0]).toMatchObject({ type: "text", text: "Discover Galway" });

    const withShape = addShape(withText, 0, "rect", { color: "#ff0000" });
    expect(withShape.scenes[0].nodes[1]).toMatchObject({ type: "shape", shape: "rect", color: "#ff0000" });

    const withImage = addCatalogImage(withShape, 0, {
      src: "/assets/galway-bay.png",
      catalogItemId: "entry-123",
    });
    expect(withImage.scenes[0].nodes[2]).toMatchObject({
      type: "image",
      src: "/assets/galway-bay.png",
      catalogItemId: "entry-123",
    });

    const withBg = setBackground(withImage, 0, "#f5f5f5");
    expect(withBg.scenes[0].background).toBe("#f5f5f5");

    // Ops are pure: the original design is never mutated.
    expect(base.scenes[0].nodes).toHaveLength(0);
    expect(withText.scenes[0].nodes).toHaveLength(1);

    // Ids are deterministic for a given op sequence (Contract 4).
    const replay = setBackground(
      addCatalogImage(
        addShape(addText(newDesign("social"), 0, "Discover Galway"), 0, "rect", { color: "#ff0000" }),
        0,
        { src: "/assets/galway-bay.png", catalogItemId: "entry-123" },
      ),
      0,
      "#f5f5f5",
    );
    expect(replay).toEqual(withBg);
    // Node ids derive from the scene id (collision-free across reorder/removal), not the position.
    expect(withBg.scenes[0].nodes.map((n) => n.id)).toEqual([
      "text-scene-n1-n1",
      "shape-scene-n1-n2",
      "image-scene-n1-n3",
    ]);

    // Move / resize / edit target an existing node by id.
    const textId = withBg.scenes[0].nodes[0].id;
    const moved = moveNode(withBg, 0, textId, 200, 300);
    expect(moved.scenes[0].nodes[0]).toMatchObject({ x: 200, y: 300 });

    const resized = resizeNode(moved, 0, textId, 500, 120);
    expect(resized.scenes[0].nodes[0]).toMatchObject({ width: 500, height: 120 });

    const edited = editText(resized, 0, textId, "Discover Connemara");
    expect(edited.scenes[0].nodes[0].text).toBe("Discover Connemara");

    // Delete removes an entity by id (AC48); it is pure and a missing target throws.
    const afterDelete = deleteNode(withBg, 0, textId);
    expect(afterDelete.scenes[0].nodes.map((n) => n.id)).toEqual([
      "shape-scene-n1-n2",
      "image-scene-n1-n3",
    ]);
    expect(withBg.scenes[0].nodes).toHaveLength(3); // original intact
    expect(() => deleteNode(withBg, 0, "no-such-node")).toThrow(/not found/);
    expect(() => deleteNode(withBg, 99, textId)).toThrow(/out of range/); // scene bounds guard

    // addScene extends a pamphlet (multi-scene, AC9).
    const pamphlet = newDesign("pamphlet");
    expect(pamphlet.scenes.length).toBeGreaterThan(1);
    const extended = addScene(pamphlet);
    expect(extended.scenes).toHaveLength(pamphlet.scenes.length + 1);

    // The design model exports to the exact `pages` shape the API PDF/HTML export consumes.
    const exported: DesignDoc = addText(newDesign("pamphlet"), 1, "Page two headline");
    const asPages = scenesAsPages(exported) as { pages: { nodes: { text?: string }[] }[] };
    expect(asPages.pages[1].nodes[0]).toMatchObject({ text: "Page two headline" });

    // Guards: bad targets fail loudly, not silently.
    expect(() => addText(base, 5, "oops")).toThrow(/out of range/);
    expect(() => moveNode(withBg, 0, "no-such-node", 0, 0)).toThrow(/not found/);
    expect(() => resizeNode(withBg, 0, textId, 0, 100)).toThrow(/must be positive/);
    const shapeId = withBg.scenes[0].nodes[1].id;
    expect(() => editText(withBg, 0, shapeId, "nope")).toThrow(/not editable text/);
  });
});

// AC46 — Multi-scene storyboard ops: add/remove/reorder scenes + per-scene duration/transition.
// Proof node-id: `apps/web/tests/studio-ops.test.ts::test_scene_ops_storyboard`.
describe("studio scene ops", () => {
  it("test_scene_ops_storyboard", () => {
    const base = newDesign("social");
    expect(base.scenes[0]).toMatchObject({
      id: "scene-n1",
      name: "Scene 1",
      durationMs: DEFAULT_SCENE_DURATION_MS,
      transition: DEFAULT_TRANSITION,
    });

    // Add scenes with deterministic, collision-free ids.
    const two = addScene(base);
    const three = addScene(two);
    expect(three.scenes.map((s) => s.id)).toEqual(["scene-n1", "scene-n2", "scene-n3"]);

    // Removing a scene then adding one never reuses an id (no collision).
    const removedMiddle = removeScene(three, 1);
    expect(removedMiddle.scenes.map((s) => s.id)).toEqual(["scene-n1", "scene-n3"]);
    const added = addScene(removedMiddle);
    expect(added.scenes.map((s) => s.id)).toEqual(["scene-n1", "scene-n3", "scene-n4"]);

    // A design always keeps at least one scene.
    expect(() => removeScene(base, 0)).toThrow(/cannot remove the last scene/);

    // Reorder rewrites the chain order (and is pure).
    const reordered = reorderScene(three, 0, 2);
    expect(reordered.scenes.map((s) => s.id)).toEqual(["scene-n2", "scene-n3", "scene-n1"]);
    expect(three.scenes.map((s) => s.id)).toEqual(["scene-n1", "scene-n2", "scene-n3"]); // original intact
    expect(() => reorderScene(three, 0, 9)).toThrow(/out of range/);

    // Duration clamps to the allowed window; transition validated; rename by id.
    const d1 = setSceneDuration(three, "scene-n2", 99999);
    expect(d1.scenes[1].durationMs).toBe(MAX_SCENE_DURATION_MS);
    const d2 = setSceneDuration(three, "scene-n2", 10);
    expect(d2.scenes[1].durationMs).toBe(MIN_SCENE_DURATION_MS);
    const t1 = setSceneTransition(three, "scene-n3", "zoom");
    expect(t1.scenes[2].transition).toBe("zoom");
    expect(() => setSceneTransition(three, "scene-n3", "warp" as never)).toThrow(/unknown transition/);
    const r1 = renameScene(three, "scene-n1", "Intro");
    expect(r1.scenes[0].name).toBe("Intro");
    expect(() => setSceneDuration(three, "no-scene", 1000)).toThrow(/not found/);

    // clampSceneDuration handles non-finite input.
    expect(clampSceneDuration(Number.NaN)).toBe(DEFAULT_SCENE_DURATION_MS);
    expect(clampSceneDuration(3000)).toBe(3000);
  });

  it("test_migrate_legacy_pages_to_scenes", () => {
    // Legacy stored design (pre-AC46) carried `pages` with no scene metadata.
    const legacy = {
      format: "social",
      width: 1080,
      height: 1080,
      pages: [{ background: "#fff", nodes: [{ id: "text-p0-n1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "Hi" }] }],
    };
    const migrated = migrateDesign(legacy)!;
    expect(migrated.scenes).toHaveLength(1);
    expect(migrated.scenes[0]).toMatchObject({
      id: "scene-n1",
      name: "Scene 1",
      durationMs: DEFAULT_SCENE_DURATION_MS,
      transition: DEFAULT_TRANSITION,
      background: "#fff",
    });
    expect(migrated.scenes[0].nodes[0]).toMatchObject({ text: "Hi" });

    // Already-migrated docs round-trip; empty/garbage returns null.
    const current = addScene(newDesign("social"));
    expect(migrateDesign(current)).toEqual(current);
    expect(migrateDesign({})).toBeNull();
    expect(migrateDesign(null)).toBeNull();
    expect(migrateDesign({ pages: [] })).toBeNull();
  });

  it("test_migrate_sanitises_odd_stored_data", () => {
    // An unknown format must not throw (getFormatPreset would) — it falls back to "social".
    const odd = migrateDesign({ format: "weird", pages: [{ nodes: [] }] })!;
    expect(odd.format).toBe("social");

    // Out-of-range duration is clamped; an invalid transition falls back to the default.
    const clamped = migrateDesign({
      scenes: [{ durationMs: 1e9, transition: "bogus" }],
    })!;
    expect(clamped.scenes[0].durationMs).toBe(MAX_SCENE_DURATION_MS);
    expect(clamped.scenes[0].transition).toBe(DEFAULT_TRANSITION);

    // Duplicate stored ids are made unique so scene lookups stay unambiguous.
    const deduped = migrateDesign({
      scenes: [{ id: "scene-n1", nodes: [] }, { id: "scene-n1", nodes: [] }],
    })!;
    expect(new Set(deduped.scenes.map((s) => s.id)).size).toBe(2);

    // Malformed nodes (missing id/type/coords) are dropped before they reach the canvas.
    const filtered = migrateDesign({
      scenes: [{ nodes: [{ id: "ok", type: "text", x: 1, y: 2 }, { type: "text" }, null, 42] }],
    })!;
    expect(filtered.scenes[0].nodes).toHaveLength(1);
    expect(filtered.scenes[0].nodes[0].id).toBe("ok");
  });
});
