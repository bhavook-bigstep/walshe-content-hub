import { describe, expect, it } from "vitest";
import {
  addGraphic,
  addSuccessorSprite,
  chainIds,
  chainMemberDurationMs,
  chainTotalMs,
  MAX_CHAIN_MEMBER_MS,
  MIN_CHAIN_MEMBER_MS,
  migrateDesign,
  newDesign,
  removeSuccessor,
  setChainDuration,
  setNodeAnim,
  spriteEndTransform,
  syncChainStarts,
  type DesignDoc,
} from "../lib/studio/ops";
import { chainSegments, spriteOwnMs } from "../lib/studio/anim";

const spriteArgs = (frames = ["a", "b", "c", "d"], fps = 10) => ({ frames, fps, width: 100, height: 100 });
const sprites = (d: DesignDoc) => d.scenes[0].nodes;
const headId = (d: DesignDoc) => sprites(d)[0].id;

describe("spriteEndTransform", () => {
  it("returns the base transform with no animation", () => {
    const d = addGraphic(newDesign("social"), 0, spriteArgs(), { x: 40, y: 60 });
    expect(spriteEndTransform(sprites(d)[0])).toMatchObject({ x: 40, y: 60, scale: 1 });
  });
  it("returns the last keyframe's values (where a successor should start)", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(), { x: 0, y: 0 });
    const id = headId(d);
    d = setNodeAnim(d, 0, id, { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 1000, x: 300, y: 120, scale: 1.5 }] });
    expect(spriteEndTransform(sprites(d)[0])).toMatchObject({ x: 300, y: 120, scale: 1.5 });
  });
});

describe("addSuccessorSprite + chainIds", () => {
  it("adds a successor at the parent's end state and links the chain", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(), { x: 10, y: 20 });
    const parent = headId(d);
    d = addSuccessorSprite(d, 0, parent, spriteArgs(["x", "y"]));
    const p = sprites(d).find((n) => n.id === parent)!;
    const succ = sprites(d).find((n) => n.id === p.successorId)!;
    expect(p.loopFrames).toBe(false); // the parent now plays once
    expect(succ.x).toBe(10); // starts at the parent's end position
    expect(succ.y).toBe(20);
    expect(succ.loopFrames).toBe(false);
    expect(chainIds(d.scenes[0], succ.id)).toEqual([parent, succ.id]); // chain resolves from any member
  });

  it("inserts a new successor between an existing pair", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(), {});
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["c"]).frames.length ? spriteArgs(["c", "d"]) : spriteArgs());
    const b = sprites(d).find((n) => n.id === a)!.successorId!;
    d = addSuccessorSprite(d, 0, a, spriteArgs(["m", "n"])); // insert after A, before B
    const mid = sprites(d).find((n) => n.id === a)!.successorId!;
    expect(chainIds(d.scenes[0], a)).toEqual([a, mid, b]);
  });
});

describe("removeSuccessor", () => {
  it("deletes a member and relinks its predecessor to its successor", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(), {});
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["b1", "b2"]));
    const b = sprites(d).find((n) => n.id === a)!.successorId!;
    d = addSuccessorSprite(d, 0, b, spriteArgs(["c1", "c2"]));
    const c = sprites(d).find((n) => n.id === b)!.successorId!;
    d = removeSuccessor(d, 0, b); // drop the middle one
    expect(sprites(d).some((n) => n.id === b)).toBe(false);
    expect(chainIds(d.scenes[0], a)).toEqual([a, c]); // A now links straight to C
  });
});

describe("chainSegments + spriteOwnMs", () => {
  it("lays members out back-to-back (each starts where the last ended), last held", () => {
    expect(spriteOwnMs({ id: "x", type: "image", x: 0, y: 0, width: 1, height: 1, frames: ["a", "b", "c", "d"], fps: 10 })).toBe(400);

    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {}); // 400ms
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["e", "f", "g", "h"], 8)); // 500ms
    const b = sprites(d).find((n) => n.id === a)!.successorId!;
    const segs = chainSegments(d.scenes[0].nodes);
    expect(segs.get(a)).toEqual({ start: 0, dur: 400, last: false, hold: false });
    // The last member with no capped duration lingers (held) so the scene doesn't end empty.
    expect(segs.get(b)).toEqual({ start: 400, dur: 500, last: true, hold: true });
  });

  it("a capped last sprite disappears when its life ends (hold:false)", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {}); // 400ms
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["e", "f"], 10));
    const b = d.scenes[0].nodes.find((n) => n.id === a)!.successorId!;
    // Give the LAST member an explicit duration → it should vanish after its slot, not linger.
    d = setChainDuration(d, 0, b, 1500);
    const seg = chainSegments(d.scenes[0].nodes).get(b)!;
    expect(seg).toMatchObject({ last: true, hold: false, dur: 1500 });
  });

  it("leaves a standalone sprite out of the chain map", () => {
    const d = addGraphic(newDesign("social"), 0, spriteArgs(), {});
    expect(chainSegments(d.scenes[0].nodes).size).toBe(0);
  });

  it("adding a successor grows a short scene so the whole chain plays", () => {
    // A tiny scene that can't fit the chain.
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {}); // 400ms
    d.scenes[0].durationMs = 500;
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["e", "f", "g", "h"], 10)); // +400ms → 800ms chain
    // Scene grew to at least the chain total (+ a short tail), so the successor's window is reachable.
    expect(d.scenes[0].durationMs).toBeGreaterThanOrEqual(chainTotalMs(d.scenes[0], a));
    const b = d.scenes[0].nodes.find((n) => n.id === a)!.successorId!;
    expect(chainSegments(d.scenes[0].nodes).get(b)!.start).toBe(400);
  });

  it("setChainDuration overrides a member's slot, clamps, and keeps the scene long enough", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {}); // 400ms
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["e", "f"], 10));
    // Give the head a long turn on stage.
    d = setChainDuration(d, 0, a, 3000);
    expect(d.scenes[0].nodes.find((n) => n.id === a)!.chainDurMs).toBe(3000);
    expect(chainMemberDurationMs(d.scenes[0].nodes.find((n) => n.id === a)!)).toBe(3000);
    expect(chainSegments(d.scenes[0].nodes).get(a)).toMatchObject({ start: 0, dur: 3000 });
    expect(d.scenes[0].durationMs).toBeGreaterThanOrEqual(chainTotalMs(d.scenes[0], a));
    // Clamped to the allowed range.
    d = setChainDuration(d, 0, a, 999999);
    expect(d.scenes[0].nodes.find((n) => n.id === a)!.chainDurMs).toBe(MAX_CHAIN_MEMBER_MS);
    d = setChainDuration(d, 0, a, 1);
    expect(d.scenes[0].nodes.find((n) => n.id === a)!.chainDurMs).toBe(MIN_CHAIN_MEMBER_MS);
  });

  it("chainMemberDurationMs falls back to the filmstrip length with no override", () => {
    const d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {});
    expect(chainMemberDurationMs(d.scenes[0].nodes[0])).toBe(400);
  });

  it("syncChainStarts locks each successor's start to its predecessor's end (and cascades)", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b"]), { x: 10, y: 20 });
    const a = headId(d);
    // Head MOVES: ends at (300, 120).
    d = setNodeAnim(d, 0, a, { keyframes: [{ t: 0, x: 10, y: 20 }, { t: 400, x: 300, y: 120 }] });
    d = addSuccessorSprite(d, 0, a, spriteArgs(["c", "d"]));
    const b = d.scenes[0].nodes.find((n) => n.id === a)!.successorId!;
    d = addSuccessorSprite(d, 0, b, spriteArgs(["e", "f"]));
    const c = d.scenes[0].nodes.find((n) => n.id === b)!.successorId!;

    // Now move the HEAD's end somewhere new and re-sync — the whole chain's starts must follow.
    d = setNodeAnim(d, 0, a, { keyframes: [{ t: 0, x: 10, y: 20 }, { t: 400, x: 500, y: 90 }] });
    d = syncChainStarts(d);
    const at = (id: string) => d.scenes[0].nodes.find((n) => n.id === id)!;
    expect({ x: at(b).x, y: at(b).y }).toEqual({ x: 500, y: 90 }); // B starts at A's end
    expect({ x: at(c).x, y: at(c).y }).toEqual({ x: 500, y: 90 }); // C (no motion) starts at B's end
    // spriteEndTransform of B (no own motion) equals its start, so the cascade holds.
    expect(spriteEndTransform(at(b))).toMatchObject({ x: 500, y: 90 });
  });

  it("syncChainStarts pins the successor's 0s keyframe to the locked start", () => {
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b"]), { x: 0, y: 0 });
    const a = headId(d);
    d = setNodeAnim(d, 0, a, { keyframes: [{ t: 0, x: 0, y: 0 }, { t: 300, x: 200, y: 80 }] });
    d = addSuccessorSprite(d, 0, a, spriteArgs(["c", "d"]));
    const b = d.scenes[0].nodes.find((n) => n.id === a)!.successorId!;
    // Give the successor its own motion starting at a WRONG 0s point; sync must pin 0s to (200,80).
    d = setNodeAnim(d, 0, b, { keyframes: [{ t: 0, x: 999, y: 999 }, { t: 200, x: 260, y: 80 }] });
    d = syncChainStarts(d);
    const kf0 = d.scenes[0].nodes.find((n) => n.id === b)!.anim!.keyframes.find((k) => k.t <= 0)!;
    expect({ x: kf0.x, y: kf0.y }).toEqual({ x: 200, y: 80 });
  });

  it("syncChainStarts returns the input unchanged when there are no chains", () => {
    const d = addGraphic(newDesign("social"), 0, spriteArgs(), { x: 5, y: 5 });
    expect(syncChainStarts(d)).toBe(d); // same reference — no allocation for non-chain designs
  });

  it("survives a full workspace-JSON round-trip (the chain lives in the saved project)", () => {
    // Build a 2-sprite chain, then serialize/parse/migrate exactly like save → load does.
    let d = addGraphic(newDesign("social"), 0, spriteArgs(["a", "b", "c", "d"], 10), {});
    const a = headId(d);
    d = addSuccessorSprite(d, 0, a, spriteArgs(["e", "f", "g", "h"], 8));
    d = setChainDuration(d, 0, a, 2500); // a custom per-member duration is part of the saved JSON

    const roundTripped = migrateDesign(JSON.parse(JSON.stringify(d)))!;
    // The successorId reference + chainDurMs are preserved verbatim, so the chain + its timeline
    // rebuild identically.
    expect(chainIds(roundTripped.scenes[0], a)).toEqual(chainIds(d.scenes[0], a));
    expect(roundTripped.scenes[0].nodes.find((n) => n.id === a)!.chainDurMs).toBe(2500);
    expect(chainSegments(roundTripped.scenes[0].nodes)).toEqual(chainSegments(d.scenes[0].nodes));
  });
});
