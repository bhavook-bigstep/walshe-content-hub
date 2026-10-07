// The animation engine: a pure, deterministic function from (node, time) → resolved transform.
//
// Declarative keyframes live on the node (ops.ts `NodeAnimation`); this module interpolates them.
// It is intentionally framework-free (no GSAP/DOM), so the EXACT same math drives the live canvas
// preview (a rAF loop) and the offscreen video frame-capture — guaranteeing export == preview, and
// keeping it unit-testable and reproducible (Contract 4).
import type { AnimKeyframe, DesignNode, Easing } from "./ops";

export { ENTER_TYPES, enterTrack, type EnterType } from "./ops";

export interface AnimState {
  x: number;
  y: number;
  /** size multiplier on the node's base box (1 = base) */
  scale: number;
  /** degrees */
  rotation: number;
  /** 0..1 */
  opacity: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── Easing ───────────────────────────────────────────────────────────────────────────────────
// Each maps a normalised progress u∈[0,1] → eased progress. Standard, dependency-free curves.
const EASE_FNS: Record<Easing, (u: number) => number> = {
  linear: (u) => u,
  easeIn: (u) => u * u,
  easeOut: (u) => 1 - (1 - u) * (1 - u),
  easeInOut: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  back: (u) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
  },
  bounce: (u) => {
    const n = 7.5625;
    const d = 2.75;
    if (u < 1 / d) return n * u * u;
    if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
    if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
    return n * (u -= 2.625 / d) * u + 0.984375;
  },
};

function ease(u: number, kind: Easing | undefined): number {
  return (EASE_FNS[kind ?? "easeInOut"] ?? EASE_FNS.easeInOut)(clamp01(u));
}

// Sample one property across the keyframes that set it. Holds the first/last value outside the
// track (so an element is invisible before its opacity ramps up — i.e. it "arrives"). `linear`
// forces constant-speed interpolation (used for frame sprites, which should move at a steady pace).
function sampleProp(
  kfs: AnimKeyframe[],
  t: number,
  key: keyof AnimKeyframe,
  base: number,
  linear = false,
): number {
  const pts = kfs.filter((k) => k[key] !== undefined);
  if (pts.length === 0) return base;
  if (t <= pts[0].t) return pts[0][key] as number;
  const last = pts[pts.length - 1];
  if (t >= last.t) return last[key] as number;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      const u = span <= 0 ? 1 : (t - a.t) / span;
      const e = linear ? clamp01(u) : ease(u, b.ease);
      return (a[key] as number) + ((b[key] as number) - (a[key] as number)) * e;
    }
  }
  return last[key] as number;
}

function baseState(node: DesignNode): AnimState {
  return { x: node.x, y: node.y, scale: 1, rotation: node.angle ?? 0, opacity: node.opacity ?? 1 };
}

/** Whether a node carries a non-trivial animation track. */
export function hasAnimation(node: DesignNode): boolean {
  return (
    (node.anim?.keyframes?.length ?? 0) > 0 ||
    node.anim?.loop !== undefined ||
    (node.frames?.length ?? 0) > 1
  );
}

export const DEFAULT_SPRITE_FPS = 10;

/** The frame index a frame-by-frame sprite shows at time `t` (ms), looping forever. Returns null
 * for a node that is not a frame sprite (fewer than two frames). `forceLoop` makes the filmstrip
 * loop regardless of `loopFrames` — used for a chained member so it keeps animating across a slot
 * longer than its filmstrip. Pure + deterministic, so the canvas preview and the video export pick
 * the same frame at the same time. */
export function frameIndexAt(node: DesignNode, t: number, forceLoop = false): number | null {
  const frames = node.frames;
  if (!frames || frames.length < 2) return null;
  const fps = node.fps && node.fps > 0 ? node.fps : DEFAULT_SPRITE_FPS;
  const frameMs = 1000 / fps;
  const raw = Math.floor(Math.max(0, t) / frameMs);
  // loopFrames defaults to true; when false the sprite plays once and holds the last frame.
  if (!forceLoop && node.loopFrames === false) return Math.min(raw, frames.length - 1);
  return raw % frames.length;
}

/** A frame sprite's own play-once duration in ms (0 for a non-sprite). */
export function spriteOwnMs(node: DesignNode): number {
  const frames = node.frames;
  if (!frames || frames.length < 2) return 0;
  const fps = node.fps && node.fps > 0 ? node.fps : DEFAULT_SPRITE_FPS;
  return (frames.length / fps) * 1000;
}

/** One member's slot length in a chain: an explicit `chainDurMs` override, else the longer of its
 * filmstrip and its own keyframe track. Kept in sync with ops.ts `memberDurMs`. */
function memberDurMs(node: DesignNode): number {
  if (node.chainDurMs && node.chainDurMs > 0) return Math.round(node.chainDurMs);
  const anim = node.anim?.keyframes?.length ? Math.max(...node.anim.keyframes.map((k) => k.t)) : 0;
  return Math.max(spriteOwnMs(node), anim, 1);
}

/** A chained sprite's time window within its scene. */
export interface ChainSegment {
  /** ms from scene start when this member begins */
  start: number;
  /** the member's slot length in ms */
  dur: number;
  /** the last member of the chain */
  last: boolean;
  /** stay visible after the slot ends (held to scene end). True only for a final member with NO
   * explicit duration set — a member whose life the user capped (`chainDurMs`) disappears instead. */
  hold: boolean;
}

/**
 * Lay out every sprite chain in `nodes` on the scene timeline: head plays [0,d0), its successor
 * [d0,d0+d1), and so on — so one animation starts exactly where the previous finished. Nodes not in
 * a chain are absent from the map (they play normally). Pure + deterministic; cycle-safe.
 */
export function chainSegments(nodes: DesignNode[]): Map<string, ChainSegment> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasPred = new Set<string>();
  for (const n of nodes) if (n.successorId && byId.has(n.successorId)) hasPred.add(n.successorId);
  const out = new Map<string, ChainSegment>();
  for (const head of nodes) {
    if (hasPred.has(head.id)) continue; // only start from a chain head
    if (!head.successorId || !byId.has(head.successorId)) continue; // standalone sprite → no chain
    const members: DesignNode[] = [];
    const seen = new Set<string>();
    let cur: DesignNode | undefined = head;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      members.push(cur);
      cur = cur.successorId ? byId.get(cur.successorId) : undefined;
    }
    let offset = 0;
    members.forEach((m, i) => {
      const dur = memberDurMs(m);
      const last = i === members.length - 1;
      // The final sprite lingers so the scene doesn't end empty — UNLESS the user capped its life
      // with an explicit duration, in which case it disappears when its time is up.
      const hold = last && !(m.chainDurMs && m.chainDurMs > 0);
      out.set(m.id, { start: offset, dur, last, hold });
      offset += dur;
    });
  }
  return out;
}

/** The clip currentTime (seconds) a slaved video shows at scene time `tMs`: its in-point
 * (`videoStartMs`) plus the elapsed scene time, so the video is driven by the scene clock — it does
 * NOT loop on its own. When the clip is shorter than the scene it holds its last frame (clamped just
 * below the clip's end). `clipDurationSec` is the real decoded duration (unknown → no clamp). Pure +
 * deterministic, so the canvas preview and the video export pick the same clip time at the same t. */
export function videoTimeAt(node: DesignNode, tMs: number, clipDurationSec?: number): number {
  const startSec = Math.max(0, (node.videoStartMs ?? 0) / 1000);
  const want = startSec + Math.max(0, tMs) / 1000;
  if (clipDurationSec !== undefined && Number.isFinite(clipDurationSec) && clipDurationSec > 0) {
    // Stay a frame below the exact end: landing on duration can snap some decoders back to 0.
    return Math.min(want, Math.max(0, clipDurationSec - 0.04));
  }
  return want;
}

/** The node's resolved transform at time `t` (ms from the scene start). Pure + deterministic. */
export function nodeStateAt(node: DesignNode, t: number): AnimState {
  const base = baseState(node);
  const anim = node.anim;
  if (!anim || (anim.keyframes.length === 0 && !anim.loop)) return base;

  // Frame-by-frame sprites move at a steady pace: force linear interpolation of their motion so a
  // sprite gliding across the scene doesn't ease-in/ease-out (its filmstrip already carries the
  // motion feel). Other nodes honour each keyframe's own easing.
  const lin = (node.frames?.length ?? 0) > 1;
  const kfs = [...anim.keyframes].sort((a, b) => a.t - b.t);
  const st: AnimState = {
    x: sampleProp(kfs, t, "x", base.x, lin),
    y: sampleProp(kfs, t, "y", base.y, lin),
    scale: sampleProp(kfs, t, "scale", base.scale, lin),
    rotation: sampleProp(kfs, t, "rotation", base.rotation, lin),
    opacity: clamp01(sampleProp(kfs, t, "opacity", base.opacity, lin)),
  };

  // Character loop, layered on after the track's last keyframe (so it starts once the element
  // settles). Each type is a periodic transform; the same math drives preview and export.
  if (anim.loop) {
    const lastT = kfs.length ? kfs[kfs.length - 1].t : 0;
    if (t >= lastT) {
      applyLoop(st, anim.loop, t - lastT);
    }
  }
  return st;
}

/** Layer a named periodic loop onto an already-resolved state. Exported for tests. */
export function applyLoop(
  st: AnimState,
  loop: NonNullable<DesignNode["anim"]>["loop"] & {},
  elapsedMs: number,
): void {
  const period = Math.max(1, loop.periodMs);
  const phase = (2 * Math.PI * elapsedMs) / period;
  switch (loop.type) {
    case "pulse":
      st.scale *= 1 + 0.05 * Math.sin(phase);
      break;
    case "bob":
      st.y += 10 * Math.sin(phase);
      break;
    case "sway":
      st.rotation += 7 * Math.sin(phase);
      break;
    case "waddle": // a walk cycle: tilt one way then the other, with a little hop at double rate
      st.rotation += 5 * Math.sin(phase);
      st.y -= 3 * Math.abs(Math.sin(phase * 2));
      break;
    case "float": // gentle buoyant drift up/down with a slight tilt
      st.y += 7 * Math.sin(phase);
      st.rotation += 3 * Math.sin(phase * 0.7);
      break;
    case "spin": // continuous rotation (one full turn per period)
      st.rotation += ((elapsedMs / period) * 360) % 360;
      break;
    case "twinkle":
      st.opacity = clamp01(st.opacity * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(phase))));
      st.scale *= 1 + 0.09 * Math.sin(phase);
      break;
    case "drift": // horizontal glide side to side (breeze, cloud)
      st.x += 16 * Math.sin(phase);
      break;
    case "rock": // a boat on water: tilt and bob out of phase
      st.rotation += 8 * Math.sin(phase);
      st.y += 4 * Math.sin(phase + Math.PI / 3);
      break;
  }
}

