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
// track (so an element is invisible before its opacity ramps up — i.e. it "arrives").
function sampleProp(kfs: AnimKeyframe[], t: number, key: keyof AnimKeyframe, base: number): number {
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
      const e = ease(u, b.ease);
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
 * for a node that is not a frame sprite (fewer than two frames). Pure + deterministic, so the
 * canvas preview and the video export pick the same frame at the same time. */
export function frameIndexAt(node: DesignNode, t: number): number | null {
  const frames = node.frames;
  if (!frames || frames.length < 2) return null;
  const fps = node.fps && node.fps > 0 ? node.fps : DEFAULT_SPRITE_FPS;
  const frameMs = 1000 / fps;
  const i = Math.floor(Math.max(0, t) / frameMs) % frames.length;
  return i;
}

/** The node's resolved transform at time `t` (ms from the scene start). Pure + deterministic. */
export function nodeStateAt(node: DesignNode, t: number): AnimState {
  const base = baseState(node);
  const anim = node.anim;
  if (!anim || (anim.keyframes.length === 0 && !anim.loop)) return base;

  const kfs = [...anim.keyframes].sort((a, b) => a.t - b.t);
  const st: AnimState = {
    x: sampleProp(kfs, t, "x", base.x),
    y: sampleProp(kfs, t, "y", base.y),
    scale: sampleProp(kfs, t, "scale", base.scale),
    rotation: sampleProp(kfs, t, "rotation", base.rotation),
    opacity: clamp01(sampleProp(kfs, t, "opacity", base.opacity)),
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

