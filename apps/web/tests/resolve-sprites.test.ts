import { describe, expect, it, vi } from "vitest";
import { resolveUserSprites, userSpriteId } from "../lib/studio/resolve-sprites";
import { addGraphic, newDesign, type DesignDoc } from "../lib/studio/ops";

const imageNodes = (d: DesignDoc) => d.scenes.flatMap((s) => s.nodes.filter((n) => n.type === "image"));

describe("userSpriteId", () => {
  it("parses a user:<id> reference, rejects anything else", () => {
    expect(userSpriteId("user:7")).toBe(7);
    expect(userSpriteId("spinning-sun")).toBeNull();
    expect(userSpriteId("user:0")).toBeNull();
    expect(userSpriteId(undefined)).toBeNull();
  });
});

describe("resolveUserSprites", () => {
  it("re-resolves frames for imported-sprite nodes from their stable user:<id> ref", async () => {
    let d = addGraphic(
      newDesign("social"),
      0,
      { frames: ["blob:dead0", "blob:dead1"], fps: 8, width: 64, height: 64, sprite: "user:5" },
      { width: 64, height: 64 },
    );
    const load = vi.fn(async (id: number) => [`blob:fresh-${id}-0`, `blob:fresh-${id}-1`]);

    d = await resolveUserSprites(d, load);

    const node = imageNodes(d)[0];
    expect(node.frames).toEqual(["blob:fresh-5-0", "blob:fresh-5-1"]); // re-resolved
    expect(node.src).toBe("blob:fresh-5-0");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("leaves non-user sprites untouched and never loads for them", async () => {
    const d = addGraphic(newDesign("social"), 0, { frames: ["a", "b"], fps: 8, width: 32, height: 32 }, {});
    const load = vi.fn();
    const out = await resolveUserSprites(d, load);
    expect(imageNodes(out)[0].frames).toEqual(["a", "b"]);
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the existing frames when a load fails", async () => {
    let d = addGraphic(newDesign("social"), 0, { frames: ["blob:x"], fps: 8, width: 32, height: 32, sprite: "user:9" }, {});
    // a single-frame addGraphic doesn't store frames (needs 2+); build one that does
    d = addGraphic(newDesign("social"), 0, { frames: ["blob:x", "blob:y"], fps: 8, width: 32, height: 32, sprite: "user:9" }, {});
    const out = await resolveUserSprites(d, async () => {
      throw new Error("gone");
    });
    expect(imageNodes(out)[0].frames).toEqual(["blob:x", "blob:y"]);
  });
});
