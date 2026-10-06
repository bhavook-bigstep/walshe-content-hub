import { describe, expect, it } from "vitest";
import { ENTER_TYPES, enterTrack, hasAnimation, nodeStateAt } from "../lib/studio/anim";
import { addText, newDesign, setNodeAnim, type DesignNode } from "../lib/studio/ops";

function textNode(extra: Partial<DesignNode> = {}): DesignNode {
  const d = addText(newDesign("social"), 0, "Hi", { fontSize: 40 });
  return { ...d.scenes[0].nodes[0], x: 100, y: 200, ...extra } as DesignNode;
}

describe("animation engine", () => {
  it("returns the base transform when a node has no animation", () => {
    const n = textNode({ opacity: 0.8, angle: 10 });
    expect(hasAnimation(n)).toBe(false);
    expect(nodeStateAt(n, 0)).toEqual({ x: 100, y: 200, scale: 1, rotation: 10, opacity: 0.8 });
    expect(nodeStateAt(n, 9999)).toEqual({ x: 100, y: 200, scale: 1, rotation: 10, opacity: 0.8 });
  });

  it("holds the first keyframe before the track and the last after it (arrival/settle)", () => {
    const n = textNode({ anim: { keyframes: [{ t: 500, opacity: 0 }, { t: 1500, opacity: 1, ease: "linear" }] } });
    expect(hasAnimation(n)).toBe(true);
    expect(nodeStateAt(n, 0).opacity).toBe(0); // invisible before it arrives
    expect(nodeStateAt(n, 500).opacity).toBe(0);
    expect(nodeStateAt(n, 1000).opacity).toBeCloseTo(0.5, 5); // linear midpoint
    expect(nodeStateAt(n, 1500).opacity).toBe(1);
    expect(nodeStateAt(n, 9999).opacity).toBe(1); // holds settled value
  });

  it("interpolates position (motion path) between keyframes", () => {
    const n = textNode({ anim: { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 1000, x: 200, y: 100, ease: "linear" }] } });
    const mid = nodeStateAt(n, 500);
    expect(mid.x).toBeCloseTo(100, 5);
    expect(mid.y).toBeCloseTo(50, 5);
  });

  it("is deterministic — same node + time give the same state", () => {
    const n = textNode({ anim: { keyframes: [{ t: 0, scale: 0.5 }, { t: 400, scale: 1, ease: "back" }] } });
    expect(nodeStateAt(n, 220)).toEqual(nodeStateAt(n, 220));
  });

  it("layers a pulse loop on top of the settled scale", () => {
    const n = textNode({ anim: { keyframes: [{ t: 0, scale: 1 }], loop: { type: "pulse", periodMs: 1000 } } });
    // Quarter period → sin = 1 → +5% scale.
    expect(nodeStateAt(n, 250).scale).toBeCloseTo(1.05, 4);
    expect(nodeStateAt(n, 0).scale).toBeCloseTo(1, 4);
  });

  it("character loops each drive their own channel (AC85)", () => {
    const at = (type: string, t: number) =>
      nodeStateAt(
        textNode({ anim: { keyframes: [{ t: 0, scale: 1 }], loop: { type: type as "pulse", periodMs: 1000 } } }),
        t,
      );
    // sway/waddle/rock tilt via rotation (base angle 0).
    expect(at("sway", 250).rotation).toBeCloseTo(7, 4); // +7° at quarter period
    expect(at("rock", 250).rotation).toBeCloseTo(8, 4);
    expect(Math.abs(at("waddle", 250).rotation)).toBeGreaterThan(0);
    // spin accumulates rotation over time (half a turn at half the period).
    expect(at("spin", 500).rotation).toBeCloseTo(180, 4);
    expect(at("spin", 0).rotation).toBeCloseTo(0, 4);
    // drift moves x; float moves y; twinkle dims opacity below the settled 1.
    expect(at("drift", 250).x).toBeCloseTo(116, 4); // base x 100 + 16
    expect(at("float", 250).y).toBeGreaterThan(200); // base y 200 + buoyancy
    expect(at("twinkle", 750).opacity).toBeLessThan(1);
  });

  it("enterTrack presets produce an invisible→visible entrance anchored at the base transform", () => {
    const n = textNode();
    for (const type of ENTER_TYPES) {
      const anim = enterTrack(n, type, 200, 600);
      const withAnim = { ...n, anim };
      expect(nodeStateAt(withAnim, 0).opacity).toBe(0);
      const settled = nodeStateAt(withAnim, 800);
      expect(settled.opacity).toBe(1);
      // Settles back to the node's own position/scale.
      expect(settled.x).toBeCloseTo(n.x, 5);
      expect(settled.y).toBeCloseTo(n.y, 5);
      expect(settled.scale).toBeCloseTo(1, 5);
    }
  });

  it("setNodeAnim sets and clears a node's animation", () => {
    let d = addText(newDesign("social"), 0, "Hi");
    const id = d.scenes[0].nodes[0].id;
    d = setNodeAnim(d, 0, id, enterTrack(d.scenes[0].nodes[0], "fade", 0, 500));
    expect(d.scenes[0].nodes[0].anim?.keyframes.length).toBe(2);
    d = setNodeAnim(d, 0, id, undefined);
    expect(d.scenes[0].nodes[0].anim).toBeUndefined();
  });
});
