import { describe, expect, it } from "vitest";
import { prepareForExport } from "../lib/studio/export-prep";
import {
  addCatalogImage,
  addGraphic,
  addPlaceholder,
  addText,
  newDesign,
  type DesignDoc,
} from "../lib/studio/ops";

const nodesOf = (d: DesignDoc) => d.scenes[0].nodes;

describe("prepareForExport", () => {
  it("drops unfilled media placeholders so their slot exports transparent", () => {
    let d = addText(newDesign("social"), 0, "Title", { fontSize: 72 });
    d = addPlaceholder(d, 0, { x: 40, y: 200, width: 400, height: 300 });
    expect(nodesOf(d).some((n) => n.placeholder)).toBe(true);

    const out = prepareForExport(d);
    expect(nodesOf(out).some((n) => n.placeholder)).toBe(false); // placeholder removed
    expect(nodesOf(out).some((n) => n.text === "Title")).toBe(true); // real content kept
  });

  it("collapses a frame sprite to a static image of frame 0", () => {
    const frames = ["data:f0", "data:f1", "data:f2"];
    const d = addGraphic(newDesign("social"), 0, { frames, fps: 8, width: 120, height: 120 }, { x: 10, y: 10 });
    const before = nodesOf(d)[0];
    expect(before.frames).toEqual(frames);

    const node = nodesOf(prepareForExport(d))[0];
    expect(node.type).toBe("image");
    expect(node.src).toBe("data:f0"); // frame 0 (initial state)
    expect(node.frames).toBeUndefined(); // no longer animated
    expect(node.fps).toBeUndefined();
    expect(node.loopFrames).toBeUndefined();
    expect(node.sprite).toBeUndefined();
  });

  it("leaves plain image/text nodes untouched and does not mutate the input", () => {
    let d = addText(newDesign("social"), 0, "Hello");
    d = addCatalogImage(d, 0, { src: "blob:photo", catalogItemId: "e-1" }, { x: 0, y: 0, width: 50, height: 50 });
    const snapshot = JSON.parse(JSON.stringify(d));

    const out = prepareForExport(d);
    expect(nodesOf(out).find((n) => n.type === "image")?.src).toBe("blob:photo");
    expect(nodesOf(out).find((n) => n.type === "text")?.text).toBe("Hello");
    expect(d).toEqual(snapshot); // non-mutating
  });
});
