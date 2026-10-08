import { describe, expect, it } from "vitest";
import {
  addCurve,
  insertCurveAnchor,
  isCurve,
  moveCurvePoint,
  newDesign,
  pointsBounds,
  sampleCurve,
  setCurvePoints,
  translateCurve,
  type DesignDoc,
} from "../lib/studio/ops";

const curveOf = (d: DesignDoc) => d.scenes[0].nodes.find((n) => isCurve(n))!;

describe("curve geometry", () => {
  it("pointsBounds covers all anchors (min 1x1)", () => {
    expect(pointsBounds([{ x: 10, y: 20 }, { x: 110, y: 70 }])).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(pointsBounds([{ x: 5, y: 5 }])).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });

  it("sampleCurve passes a straight line through unchanged, and interpolates 3+ anchors through them", () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(sampleCurve(line)).toEqual(line); // 2 anchors → straight

    const pts = [{ x: 0, y: 0 }, { x: 50, y: 60 }, { x: 100, y: 0 }];
    const s = sampleCurve(pts, 10);
    expect(s.length).toBeGreaterThan(pts.length); // densified
    // The spline passes through every anchor.
    for (const a of pts) {
      expect(s.some((q) => Math.abs(q.x - a.x) < 0.001 && Math.abs(q.y - a.y) < 0.001)).toBe(true);
    }
  });
});

describe("curve ops", () => {
  it("addCurve inserts a 2-anchor straight line shape, bbox-fitted", () => {
    const n = curveOf(addCurve(newDesign("social"), 0, { x: 100, y: 200, width: 400 }));
    expect(n.type).toBe("shape");
    expect(n.points).toHaveLength(2);
    expect(isCurve(n)).toBe(true);
    const b = pointsBounds(n.points!);
    expect({ x: n.x, y: n.y, width: n.width, height: n.height }).toEqual(b);
  });

  it("moveCurvePoint moves one anchor and re-fits the bbox", () => {
    let d = addCurve(newDesign("social"), 0);
    const id = curveOf(d).id;
    d = moveCurvePoint(d, 0, id, 0, { x: -50, y: -30 });
    const n = curveOf(d);
    expect(n.points![0]).toEqual({ x: -50, y: -30 });
    expect(n.x).toBe(Math.min(-50, n.points![1].x)); // bbox followed the moved anchor
  });

  it("insertCurveAnchor splits the nearest segment, growing the anchor count", () => {
    let d = setCurvePoints(addCurve(newDesign("social"), 0), 0, curveOf(addCurve(newDesign("social"), 0)).id, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    // Re-derive the id after setCurvePoints on a fresh design.
    d = addCurve(newDesign("social"), 0);
    const id = curveOf(d).id;
    d = setCurvePoints(d, 0, id, [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    d = insertCurveAnchor(d, 0, id, { x: 50, y: 40 });
    const n = curveOf(d);
    expect(n.points).toHaveLength(3);
    expect(n.points![1]).toEqual({ x: 50, y: 40 }); // inserted between the two originals
  });

  it("translateCurve shifts every anchor by (dx,dy)", () => {
    let d = addCurve(newDesign("social"), 0);
    const id = curveOf(d).id;
    const before = curveOf(d).points!.map((p) => ({ ...p }));
    d = translateCurve(d, 0, id, 25, -15);
    const after = curveOf(d).points!;
    after.forEach((p, i) => expect(p).toEqual({ x: before[i].x + 25, y: before[i].y - 15 }));
  });
});
