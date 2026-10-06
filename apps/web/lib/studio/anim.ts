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
  return (node.anim?.keyframes?.length ?? 0) > 0 || node.anim?.loop !== undefined;
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

  // Emphasis loop, layered on after the track's last keyframe (so it starts once the element settles).
  if (anim.loop) {
    const lastT = kfs.length ? kfs[kfs.length - 1].t : 0;
    if (t >= lastT) {
      const phase = (2 * Math.PI * (t - lastT)) / Math.max(1, anim.loop.periodMs);
      if (anim.loop.type === "pulse") st.scale *= 1 + 0.05 * Math.sin(phase);
      else st.y += 10 * Math.sin(phase); // bob
    }
  }
  return st;
}

