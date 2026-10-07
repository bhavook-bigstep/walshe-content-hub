import { describe, expect, it } from "vitest";
import {
  PLACEHOLDER_SRC,
  addPlaceholder,
  fillImageNode,
  isPlaceholder,
  newDesign,
} from "../lib/studio/ops";

// AC91 — a photo placeholder is a first-class image node (dashed frame) that a picked photo fills
// in place, carrying the objectKey so the filled image survives a reload.
describe("image placeholder", () => {
  it("addPlaceholder inserts a flagged image node with the placeholder art", () => {
    const d = addPlaceholder(newDesign("social"), 0, { x: 40, y: 60 });
    const node = d.scenes[0].nodes.at(-1)!;
    expect(node.type).toBe("image");
    expect(node.placeholder).toBe(true);
    expect(node.src).toBe(PLACEHOLDER_SRC);
    expect(isPlaceholder(node)).toBe(true);
    expect(node).toMatchObject({ x: 40, y: 60 });
  });

  it("fillImageNode replaces the art, clears the flag and records the objectKey", () => {
    let d = addPlaceholder(newDesign("social"), 0);
    const id = d.scenes[0].nodes[0].id;
    d = fillImageNode(d, 0, id, {
      src: "blob:preview",
      objectKey: "users/1/abc",
      catalogItemId: "item-9",
    });
    const node = d.scenes[0].nodes[0];
    expect(node.placeholder).toBeUndefined(); // no longer a placeholder
    expect(isPlaceholder(node)).toBe(false);
    expect(node.src).toBe("blob:preview");
    expect(node.objectKey).toBe("users/1/abc"); // survives reload via objectKey
    expect(node.catalogItemId).toBe("item-9");
  });

  it("a plain image node is not a placeholder", () => {
    const d = addPlaceholder(newDesign("social"), 0);
    const filled = fillImageNode(d, 0, d.scenes[0].nodes[0].id, { src: "x" });
    expect(isPlaceholder(filled.scenes[0].nodes[0])).toBe(false);
  });
});
