import { describe, expect, it } from "vitest";
import { LOOP_TYPES, addGraphic, newDesign } from "../lib/studio/ops";
import { ABSTRACT_ARTIFACTS, SPRITE_ANIMATIONS, STICKERS, svgDataUrl } from "../lib/studio/graphics";

describe("built-in graphics + sprites", () => {
  it("every artifact/sticker/sprite has a usable SVG data URL", () => {
    for (const g of [...ABSTRACT_ARTIFACTS, ...STICKERS, ...SPRITE_ANIMATIONS]) {
      expect(g.svg).toContain("<svg");
      expect(svgDataUrl(g.svg).startsWith("data:image/svg+xml,")).toBe(true);
      expect(g.width).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThan(0);
    }
    // Unique ids within each set.
    const ids = [...ABSTRACT_ARTIFACTS, ...STICKERS, ...SPRITE_ANIMATIONS].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("addGraphic inserts an image node with the SVG source", () => {
    const art = ABSTRACT_ARTIFACTS[0];
    const d = addGraphic(newDesign("social"), 0, { src: svgDataUrl(art.svg), width: art.width, height: art.height }, { x: 50, y: 60 });
    const node = d.scenes[0].nodes.at(-1)!;
    expect(node.type).toBe("image");
    expect(node.src).toBe(svgDataUrl(art.svg));
    expect(node).toMatchObject({ x: 50, y: 60, width: art.width, height: art.height });
    expect(node.anim).toBeUndefined(); // a plain graphic carries no animation
  });

  it("a sprite's animation is built from its entrance + loop, anchored at its placement", () => {
    const rise = SPRITE_ANIMATIONS.find((s) => s.enter === "rise")!;
    const d = addGraphic(
      newDesign("social"),
      0,
      { src: svgDataUrl(rise.svg), width: rise.width, height: rise.height, enter: rise.enter, loop: rise.loop },
      { x: 100, y: 200 },
    );
    const node = d.scenes[0].nodes.at(-1)!;
    const kfs = node.anim?.keyframes ?? [];
    expect(kfs.length).toBe(2);
    // Rises from below its placed y up to its placed y (anchored at 200, not 0).
    expect(kfs[0].y).toBe(280);
    expect(kfs[1].y).toBe(200);
    expect(node.anim?.enter?.type).toBe("rise");
  });

  it("a looping sprite carries the loop", () => {
    const pulse = SPRITE_ANIMATIONS.find((s) => s.loop?.type === "pulse")!;
    const d = addGraphic(newDesign("social"), 0, { src: svgDataUrl(pulse.svg), width: pulse.width, height: pulse.height, enter: pulse.enter, loop: pulse.loop });
    expect(d.scenes[0].nodes.at(-1)!.anim?.loop?.type).toBe("pulse");
  });

  it("ships a rich roster of named, moving sprites (AC85)", () => {
    // Recognisable subjects, not reused stickers.
    const ids = SPRITE_ANIMATIONS.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["walking-panda", "blooming-flower", "breeze"]));
    expect(SPRITE_ANIMATIONS.length).toBeGreaterThanOrEqual(12);
    // Every sprite actually moves (a loop or an entrance) with a valid loop type, and carries real
    // multi-element artwork rather than a one-shape sticker.
    for (const s of SPRITE_ANIMATIONS) {
      expect(s.loop || s.enter).toBeTruthy();
      if (s.loop) expect(LOOP_TYPES).toContain(s.loop.type);
      expect(s.svg.split("<path").length + s.svg.split("<circle").length).toBeGreaterThan(2);
    }
    // The motions are varied, not all the same loop.
    const loops = new Set(SPRITE_ANIMATIONS.map((s) => s.loop?.type));
    expect(loops.size).toBeGreaterThanOrEqual(5);
  });
});
