import { describe, expect, it } from "vitest";
import { addGraphic, addText, newDesign } from "../lib/studio/ops";
import {
  ABSTRACT_ARTIFACTS,
  SPRITE_ANIMATIONS,
  STICKERS,
  resolveSprites,
  svgDataUrl,
} from "../lib/studio/graphics";

describe("built-in graphics + sprites", () => {
  it("every artifact/sticker/sprite has usable SVG art + unique ids", () => {
    for (const g of [...ABSTRACT_ARTIFACTS, ...STICKERS, ...SPRITE_ANIMATIONS]) {
      expect(g.svg).toContain("<svg"); // sprite svg is frame 0 (the thumbnail)
      expect(svgDataUrl(g.svg).startsWith("data:image/svg+xml,")).toBe(true);
      expect(g.width).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
    }
    const ids = [...ABSTRACT_ARTIFACTS, ...STICKERS, ...SPRITE_ANIMATIONS].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("addGraphic inserts a plain image node with the SVG source", () => {
    const art = ABSTRACT_ARTIFACTS[0];
    const d = addGraphic(newDesign("social"), 0, { src: svgDataUrl(art.svg), width: art.width, height: art.height }, { x: 50, y: 60 });
    const node = d.scenes[0].nodes.at(-1)!;
    expect(node.type).toBe("image");
    expect(node.src).toBe(svgDataUrl(art.svg));
    expect(node).toMatchObject({ x: 50, y: 60, width: art.width, height: art.height });
    expect(node.anim).toBeUndefined();
    expect(node.frames).toBeUndefined();
  });

  it("addGraphic builds an entrance + loop track from an intent", () => {
    const d = addGraphic(
      newDesign("social"),
      0,
      { src: "data:x", width: 100, height: 100, enter: "rise", loop: { type: "pulse", periodMs: 1000 } },
      { x: 100, y: 200 },
    );
    const node = d.scenes[0].nodes.at(-1)!;
    const kfs = node.anim?.keyframes ?? [];
    expect(kfs.length).toBe(2);
    expect(kfs[0].y).toBe(280); // rises from below its placed y (200 + 80)
    expect(kfs[1].y).toBe(200);
    expect(node.anim?.enter?.type).toBe("rise");
    expect(node.anim?.loop?.type).toBe("pulse");
  });

  it("addGraphic inserts a frame-by-frame sprite (filmstrip + fps, src = frame 0)", () => {
    const frames = ["data:f0", "data:f1", "data:f2", "data:f3"];
    const d = addGraphic(newDesign("social"), 0, { width: 200, height: 200, frames, fps: 8 });
    const node = d.scenes[0].nodes.at(-1)!;
    expect(node.type).toBe("image");
    expect(node.frames).toEqual(frames);
    expect(node.fps).toBe(8);
    expect(node.src).toBe("data:f0"); // static fallback = first frame
  });

  it("resolveSprites expands a template sprite id into its filmstrip (AC92)", () => {
    // A template node references a sprite by id with no frames yet.
    let d = addText(newDesign("social"), 0, "x");
    const scene = d.scenes[0];
    scene.nodes.push({ id: "spr", type: "image", sprite: "walking-panda", x: 0, y: 0, width: 200, height: 160 });
    d = resolveSprites(d);
    const node = d.scenes[0].nodes.find((n) => n.id === "spr")!;
    const panda = SPRITE_ANIMATIONS.find((s) => s.id === "walking-panda")!;
    expect(node.frames).toEqual(panda.frames);
    expect(node.fps).toBe(panda.fps);
    expect(node.src).toBe(panda.frames[0]);
    // Idempotent + leaves non-sprite nodes untouched.
    expect(resolveSprites(d)).toEqual(d);
    expect(d.scenes[0].nodes.find((n) => n.id !== "spr" && n.type === "text")).toBeTruthy();
  });

  it("ships a rich roster of frame-animated sprites with moving parts (AC85)", () => {
    const ids = SPRITE_ANIMATIONS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["walking-panda", "blooming-flower", "flapping-bird"]));
    expect(SPRITE_ANIMATIONS.length).toBeGreaterThanOrEqual(10);
    for (const s of SPRITE_ANIMATIONS) {
      // Each is a real filmstrip played at a sane rate, with several DISTINCT poses so parts move.
      // (A cycle may legitimately repeat an in-between pose — e.g. a wing's mid-flap — so we require
      // at least three distinct frames rather than all-unique.)
      expect(s.frames.length).toBeGreaterThanOrEqual(4);
      expect(s.fps).toBeGreaterThan(0);
      expect(new Set(s.frames).size).toBeGreaterThanOrEqual(3);
      for (const f of s.frames) expect(f.startsWith("data:image/svg+xml,")).toBe(true);
    }
  });
});
