import { describe, expect, it } from "vitest";
import {
  addCatalogImage,
  addPage,
  addShape,
  addText,
  editText,
  moveNode,
  newDesign,
  resizeNode,
  setBackground,
  type DesignDoc,
} from "../lib/studio/ops";

// AC9 — Manual mode: add/move/resize/edit text, shapes, backgrounds, and catalog images;
// multi-page for pamphlets. Proof node-id: `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design`.
describe("studio manual ops", () => {
  it("test_manual_ops_mutate_design", () => {
    // A social design starts single-page and empty.
    const base = newDesign("social");
    expect(base.pages).toHaveLength(1);
    expect(base.pages[0].nodes).toHaveLength(0);

    // Each op produces the expected design node.
    const withText = addText(base, 0, "Discover Galway");
    expect(withText.pages[0].nodes[0]).toMatchObject({ type: "text", text: "Discover Galway" });

    const withShape = addShape(withText, 0, "rect", { color: "#ff0000" });
    expect(withShape.pages[0].nodes[1]).toMatchObject({ type: "shape", shape: "rect", color: "#ff0000" });

    const withImage = addCatalogImage(withShape, 0, {
      src: "/assets/galway-bay.png",
      catalogItemId: "entry-123",
    });
    expect(withImage.pages[0].nodes[2]).toMatchObject({
      type: "image",
      src: "/assets/galway-bay.png",
      catalogItemId: "entry-123",
    });

    const withBg = setBackground(withImage, 0, "#f5f5f5");
    expect(withBg.pages[0].background).toBe("#f5f5f5");

    // Ops are pure: the original design is never mutated.
    expect(base.pages[0].nodes).toHaveLength(0);
    expect(withText.pages[0].nodes).toHaveLength(1);

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
    expect(withBg.pages[0].nodes.map((n) => n.id)).toEqual(["text-p0-n1", "shape-p0-n2", "image-p0-n3"]);

    // Move / resize / edit target an existing node by id.
    const textId = withBg.pages[0].nodes[0].id;
    const moved = moveNode(withBg, 0, textId, 200, 300);
    expect(moved.pages[0].nodes[0]).toMatchObject({ x: 200, y: 300 });

    const resized = resizeNode(moved, 0, textId, 500, 120);
    expect(resized.pages[0].nodes[0]).toMatchObject({ width: 500, height: 120 });

    const edited = editText(resized, 0, textId, "Discover Connemara");
    expect(edited.pages[0].nodes[0].text).toBe("Discover Connemara");

    // addPage extends a pamphlet (multi-page, AC9).
    const pamphlet = newDesign("pamphlet");
    expect(pamphlet.pages.length).toBeGreaterThan(1);
    const extended = addPage(pamphlet);
    expect(extended.pages).toHaveLength(pamphlet.pages.length + 1);

    // The design model is the exact shape the API PDF/HTML export consumes.
    const exported: DesignDoc = addText(newDesign("pamphlet"), 1, "Page two headline");
    expect(exported.pages[1].nodes[0]).toMatchObject({ type: "text", text: "Page two headline" });

    // Guards: bad targets fail loudly, not silently.
    expect(() => addText(base, 5, "oops")).toThrow(/out of range/);
    expect(() => moveNode(withBg, 0, "no-such-node", 0, 0)).toThrow(/not found/);
    expect(() => resizeNode(withBg, 0, textId, 0, 100)).toThrow(/must be positive/);
    const shapeId = withBg.pages[0].nodes[1].id;
    expect(() => editText(withBg, 0, shapeId, "nope")).toThrow(/not editable text/);
  });
});
