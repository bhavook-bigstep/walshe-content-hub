import { describe, expect, it } from "vitest";
import { nodeStateAt } from "../lib/studio/anim";
import { addText, newDesign, setNodeAnim, type DesignNode } from "../lib/studio/ops";

// Custom keyframe tracks are what the dope-sheet editor authors (beyond the entrance presets):
// multi-point motion paths, scale/rotation ramps, retimed keyframes. These assert the engine plays
// exactly such tracks, so the editor's output is faithful.
function node(extra: Partial<DesignNode> = {}): DesignNode {
  const d = addText(newDesign("social"), 0, "Hi");
  return { ...d.scenes[0].nodes[0], x: 0, y: 0, ...extra } as DesignNode;
}

describe("custom keyframe tracks (dope-sheet)", () => {
  it("plays a 3-point motion path as a polyline", () => {
    const n = node({
      anim: {
        keyframes: [
          { t: 0, x: 0, y: 0 },
          { t: 1000, x: 100, y: 0, ease: "linear" },
          { t: 2000, x: 100, y: 100, ease: "linear" },
        ],
      },
    });
    expect(nodeStateAt(n, 500).x).toBeCloseTo(50, 5); // along segment 1
    expect(nodeStateAt(n, 1000).x).toBeCloseTo(100, 5);
    expect(nodeStateAt(n, 1500).y).toBeCloseTo(50, 5); // along segment 2
    expect(nodeStateAt(n, 2000).y).toBeCloseTo(100, 5);
  });

  it("interpolates scale and rotation keyframes", () => {
    const n = node({
      anim: {
        keyframes: [
          { t: 0, scale: 1, rotation: 0 },
          { t: 1000, scale: 2, rotation: 90, ease: "linear" },
        ],
      },
    });
    const mid = nodeStateAt(n, 500);
    expect(mid.scale).toBeCloseTo(1.5, 5);
    expect(mid.rotation).toBeCloseTo(45, 5);
  });

  it("sorts out-of-order keyframes (the editor may append or retime them)", () => {
    const ordered = node({ anim: { keyframes: [{ t: 0, x: 0 }, { t: 1000, x: 100, ease: "linear" }] } });
    const shuffled = node({ anim: { keyframes: [{ t: 1000, x: 100, ease: "linear" }, { t: 0, x: 0 }] } });
    expect(nodeStateAt(shuffled, 500).x).toBeCloseTo(nodeStateAt(ordered, 500).x, 5);
  });

  it("setNodeAnim stores a custom track (keyframes, no entrance preset)", () => {
    let d = addText(newDesign("social"), 0, "Hi");
    const id = d.scenes[0].nodes[0].id;
    d = setNodeAnim(d, 0, id, { keyframes: [{ t: 0, x: 0 }, { t: 500, x: 50 }] });
    expect(d.scenes[0].nodes[0].anim?.keyframes.length).toBe(2);
    expect(d.scenes[0].nodes[0].anim?.enter).toBeUndefined();
  });
});
