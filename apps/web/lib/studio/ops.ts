/**
 * Design Studio operations (AC9 + AC46 storyboard).
 *
 * The studio edits a **serialisable design model** — not the live Fabric.js canvas directly — so
 * every operation is a pure, deterministic function (design in → new design out). This is what
 * makes the studio testable in vitest without a DOM/canvas (jsdom has no canvas), and it is the
 * exact shape the API's PDF/HTML export consumes
 * (apps/api/app/media/pdf.py: `{"pages": [{"nodes": [{"type": "text", "text": "..."}]}]}`).
 *
 * AC46 promotes a page to a **Scene**: a page's `{background?, nodes[]}` plus a storyboard
 * `durationMs` (lifespan) and a `transition` into the next scene. The ordered `scenes[]` array IS
 * the auto-sequential chain `1 → 2 → 3`; reordering rewrites the order. A single-scene doc is an
 * ordinary design. The server export still consumes a list of `{background, nodes}`, so at the
 * export boundary the scenes are passed as `pages` (a Scene is a superset of DesignPage); see
 * `scenesAsPages`.
 *
 * Determinism (Contract 4 / testing rule): node ids derive from the scene's node count and scene
 * ids from the current max suffix — never from Math.random()/Date.now() — so the same sequence of
 * ops yields byte-identical output.
 */

import { getFormatPreset, isFormatName, type FormatName } from "./formats";

export type NodeType = "text" | "shape" | "image" | "background";
export type ShapeKind = "rect" | "ellipse" | "line";

/** One anchor of an editable curve (scene-local coordinates). */
export interface CurvePoint {
  x: number;
  y: number;
}

/** The transition played INTO the next scene when the sequence is stitched to video. */
export type TransitionKind = "none" | "fade" | "slide-left" | "zoom";
export const TRANSITION_KINDS: readonly TransitionKind[] = ["none", "fade", "slide-left", "zoom"];

export const DEFAULT_SCENE_DURATION_MS = 4000;
export const MIN_SCENE_DURATION_MS = 500;
export const MAX_SCENE_DURATION_MS = 15000;
export const DEFAULT_TRANSITION: TransitionKind = "fade";

export type FontWeight = "normal" | "bold";
export type FontStyle = "normal" | "italic";
export type TextAlign = "left" | "center" | "right";

// ── Animation model (declarative, JSON-serialisable; lives in the workspace scenes) ─────────────
// Each element may carry a keyframe track: at time `t` (ms from the scene start) it has a position,
// scale, rotation and opacity. A pure engine (lib/studio/anim.ts) interpolates between keyframes —
// the SAME engine drives the live canvas preview and the video frame-capture, so export == preview.
export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "back" | "bounce";
export const EASINGS: readonly Easing[] = ["linear", "easeIn", "easeOut", "easeInOut", "back", "bounce"];

/** Entrance presets the engine expands into keyframes (authoring sugar). */
export type EnterType = "fade" | "rise" | "slide-left" | "slide-right" | "scale";
export const ENTER_TYPES: readonly EnterType[] = ["fade", "rise", "slide-left", "slide-right", "scale"];

export interface AnimKeyframe {
  /** Time in ms from the scene's start. */
  t: number;
  /** Absolute x/y (canvas units). Omitted → the node's base x/y. Two+ keyframes = a motion path. */
  x?: number;
  y?: number;
  /** Size multiplier on the node's base box (1 = base). */
  scale?: number;
  /** Absolute rotation in degrees. */
  rotation?: number;
  /** 0..1. */
  opacity?: number;
  /** Easing used to interpolate INTO this keyframe from the previous one. */
  ease?: Easing;
}

export interface NodeAnimation {
  /** The resolved keyframe track the engine plays. Empty/one keyframe = effectively static. */
  keyframes: AnimKeyframe[];
  /** Authoring intent for the entrance preset, so the Inspector can round-trip the controls. The
   * engine ignores this and plays `keyframes` (which the UI regenerates from it). */
  enter?: { type: EnterType; startMs: number; durationMs: number; ease?: Easing };
  /** Optional emphasis/character loop applied on top of the track, after the last keyframe time.
   * The engine (anim.ts) interprets each type as a periodic transform (see `LOOP_TYPES`). */
  loop?: { type: LoopType; periodMs: number };
}

/** The periodic loop motions the engine can layer on a node (anim.ts `nodeStateAt`). Named so a
 * sprite reads as its character: a boat rocks, a balloon floats, the sun spins, a star twinkles. */
export type LoopType =
  | "pulse" // scale wobble
  | "bob" // vertical bounce
  | "sway" // tilt side to side
  | "waddle" // walk-cycle tilt + hop
  | "float" // drift up/down with a slight tilt
  | "spin" // continuous rotation
  | "twinkle" // opacity + scale sparkle
  | "drift" // horizontal glide
  | "rock"; // tilt + bob, like a boat on water

export const LOOP_TYPES: readonly LoopType[] = [
  "pulse", "bob", "sway", "waddle", "float", "spin", "twinkle", "drift", "rock",
];

export interface DesignNode {
  readonly id: string;
  readonly type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** text nodes only */
  text?: string;
  /** shape nodes only */
  shape?: ShapeKind;
  /** fill/stroke/background colour */
  color?: string;
  /** image nodes only — the served catalog asset URL (ephemeral blob/data; re-resolved on open) */
  src?: string;
  /** image nodes only — provenance back to the approved catalog entry */
  catalogItemId?: string;
  /** image nodes only — the stable storage object key, used to re-resolve `src` after reload */
  objectKey?: string;

  // ---- Styling (optional; sensible defaults applied at render) ----
  /** text: font size in px */
  fontSize?: number;
  /** text: font family */
  fontFamily?: string;
  /** text: normal | bold */
  fontWeight?: FontWeight;
  /** text: normal | italic */
  fontStyle?: FontStyle;
  /** text: horizontal alignment */
  textAlign?: TextAlign;
  /** text: line height multiplier */
  lineHeight?: number;
  /** all nodes: 0..1 */
  opacity?: number;
  /** all nodes: rotation in degrees */
  angle?: number;
  /** shape/image: corner radius in px (rect + image frames) */
  radius?: number;
  /** shape: stroke colour (outline) */
  stroke?: string;
  /** shape: stroke width in px */
  strokeWidth?: number;
  /** shape (curve): ordered anchor points, scene-local coords. A `shape` node with `points` renders
   * as an editable curve smoothed through the anchors (2 points = a straight line). */
  points?: CurvePoint[];

  /** optional keyframe animation (position/scale/rotation/opacity over time within the scene) */
  anim?: NodeAnimation;
  /** group membership — the node's INNERMOST group id (nesting lives on `Scene.groups.parentId`).
   * Nodes sharing a groupId move/animate together; ancestry is read from the group registry. */
  groupId?: string;

  /** image only — a frame-by-frame sprite: an ordered list of frame image srcs cycled over time
   * (classic 2D game-sprite animation). `src` holds frame 0 as the static fallback. */
  frames?: string[];
  /** frames playback rate (frames per second); defaults to 10 when `frames` is set. */
  fps?: number;
  /** frames: whether the filmstrip loops (default true) or plays once and holds the last frame. */
  loopFrames?: boolean;
  /** image only — an unfilled media placeholder (dashed frame); clicking it opens the media drawer
   * to fill it with a photo or video (cleared once filled). */
  placeholder?: boolean;
  /** image only — set when a node holds a VIDEO clip: the video's stable object key. `src` keeps a
   * poster still as the serialisable fallback; the key re-resolves `videoSrc` after a reload. */
  videoKey?: string;
  /** image only — the ephemeral served URL (blob/data) of the video clip itself, resolved from
   * `videoKey`. When present the canvas + export render the live video frame (not the poster); it
   * is re-resolved on open (like `src`) and is dead across a reload until then. */
  videoSrc?: string;
  /** image only — the clip's in-point in ms: the scene starts the video from here and advances it
   * with scene time (slaved to the scene, not looping on its own). On a scene loop it restarts from
   * this point; if the clip ends before the scene does it holds its last frame. Defaults to 0. */
  videoStartMs?: number;
  /** image only — a built-in sprite id (e.g. "walking-panda"); the studio resolves it to `frames`
   * + `fps` on load (so templates can reference a sprite without embedding its filmstrip). */
  sprite?: string;
  /** sprite only — the id of the sprite that plays NEXT, starting where this one finishes (same
   * place/state). Chains sprite animations: head → successor → …; during preview/export each plays
   * its filmstrip once in turn. */
  successorId?: string;
  /** sprite-chain only — how long (ms) this member holds the stage before handing off to its
   * successor. Overrides the member's natural filmstrip length; the sprite loops its frames to fill
   * the slot. Undefined = use the filmstrip length. */
  chainDurMs?: number;
}

/** The style keys that `updateNode` may patch on a node (never id/type/geometry writes). */
export type NodeStyle = Pick<
  DesignNode,
  | "color"
  | "text"
  | "shape"
  | "src"
  | "fontSize"
  | "fontFamily"
  | "fontWeight"
  | "fontStyle"
  | "textAlign"
  | "lineHeight"
  | "opacity"
  | "angle"
  | "radius"
  | "stroke"
  | "strokeWidth"
  | "fps"
  | "loopFrames"
  | "videoStartMs"
>;

/** The base page shape the server PDF/HTML export consumes (a list of these). */
export interface DesignPage {
  /** page background colour; undefined = transparent/white */
  background?: string;
  nodes: DesignNode[];
}

/** One time-cued narration line: the voiceover `text` starts at `atMs` into the scene. */
export interface NarrationCue {
  atMs: number;
  text: string;
}

// ── Nested group model (AC1–AC7) ────────────────────────────────────────────────────────────────
// A node's `groupId` is its INNERMOST group; nesting lives on the group registry (`Scene.groups`),
// where each `SceneGroup` points at its enclosing group via `parentId`. This keeps node records flat
// (a node belongs to exactly one innermost group) while the *nesting* is expressed between groups —
// so an empty intermediate group can exist and the whole tree round-trips through save/load (D7).

/** A group's animation intent: an entrance preset applied to the group + an emphasis loop. The
 * entrance `durationMs` drives how long a child stays hidden before it plays (strict parent-first). */
export interface GroupAnim {
  /** entrance preset for the whole group (undefined = no group entrance) */
  enter?: EnterType;
  /** entrance duration in ms (default {@link DEFAULT_GROUP_ENTER_MS}); drives children's start offset */
  durationMs?: number;
  ease?: Easing;
  /** the group's own arrival/appearance timestamp (ms): how long the whole group stays hidden before
   * it appears, within its parent's timeline. Adds to every descendant's start offset (recompose).
   * Works with or without an entrance preset (a group can simply appear late). Default 0. */
  startMs?: number;
  /** emphasis/character loop applied to members */
  loop?: NodeAnimation["loop"];
}

/** One group in a scene's group registry. The tree is formed by `parentId` links. */
export interface SceneGroup {
  /** "group-N" (shares the id scheme used on `DesignNode.groupId`) */
  readonly id: string;
  /** enclosing group id; undefined = a top-level group */
  parentId?: string;
  /** display label in the tree */
  name?: string;
  /** group-level entrance + loop authoring intent (baked onto members by `recomposeSceneGroups`) */
  anim?: GroupAnim;
}

/** The default group entrance duration (ms) when a group has an entrance but no explicit duration. */
export const DEFAULT_GROUP_ENTER_MS = 600;

/** A page promoted to a storyboard scene (AC46): adds identity, lifespan and a transition. */
export interface Scene extends DesignPage {
  readonly id: string;
  name: string;
  /** lifespan in ms (clamped 500..15000) */
  durationMs: number;
  /** transition INTO the next scene */
  transition: TransitionKind;
  /** optional time-cued voiceover lines read over this scene when the video is narrated */
  narration?: NarrationCue[];
  /** nested-group registry (AC1/AC3): group ids + parent links + group-level animation intent.
   * Optional so pre-existing scenes (and tests) that omit it stay valid (AC8). */
  groups?: SceneGroup[];
}

/** Normalise a scene's narration to cues (handles the legacy single-string form). Keeps blank-text
 * cues so a line can be added and typed into; drop blanks at export via `speakableCues`. */
export function narrationCues(scene: Pick<Scene, "narration">): NarrationCue[] {
  const n = scene.narration as NarrationCue[] | string | undefined;
  if (!n) return [];
  if (typeof n === "string") return n.trim() ? [{ atMs: 0, text: n }] : [];
  return n
    .filter((c) => c && typeof c.text === "string")
    .map((c) => ({ atMs: Math.max(0, Math.round(c.atMs) || 0), text: c.text }));
}

/** The cues that actually get spoken: narration lines with non-blank text, in time order. */
export function speakableCues(scene: Pick<Scene, "narration">): NarrationCue[] {
  return narrationCues(scene)
    .filter((c) => c.text.trim())
    .sort((a, b) => a.atMs - b.atMs);
}

export interface DesignDoc {
  format: FormatName;
  width: number;
  height: number;
  /** ordered scenes — the auto-sequential chain is this order */
  scenes: Scene[];
}

export interface NodePlacement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  // Optional styling the creator may set up front (templates use these heavily).
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  textAlign?: TextAlign;
  lineHeight?: number;
  opacity?: number;
  angle?: number;
  radius?: number;
  stroke?: string;
  strokeWidth?: number;
}

/** Copy only the defined styling fields from a placement onto a new node. */
function stylePlacement(p: NodePlacement): Partial<DesignNode> {
  const out: Partial<DesignNode> = {};
  const keys = [
    "fontSize", "fontFamily", "fontWeight", "fontStyle", "textAlign", "lineHeight",
    "opacity", "angle", "radius", "stroke", "strokeWidth",
  ] as const;
  for (const k of keys) if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];
  return out;
}

const DEFAULT_PLACEMENT = { x: 64, y: 64, width: 320, height: 96 } as const;

/** Clamp a scene duration into the allowed window; non-finite falls back to the default. */
export function clampSceneDuration(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_SCENE_DURATION_MS;
  return Math.min(MAX_SCENE_DURATION_MS, Math.max(MIN_SCENE_DURATION_MS, Math.round(ms)));
}

/**
 * Deterministic id: `<type>-<sceneId>-n<countInScene>` — stable for a given op sequence and unique
 * across the whole design (scene ids are collision-free), so ids survive scene reorder/removal.
 */
// A unique, stable node id: `<type>-<sceneId>-n<1 + max existing node suffix in the scene>`.
// Scanning the max trailing suffix (instead of nodes.length) keeps ids collision-free after a
// delete — reusing an id would make the canvas conflate two nodes and their positions jump.
function nextId(type: NodeType, scene: Scene): string {
  let max = 0;
  for (const n of scene.nodes) {
    const m = /-n(\d+)$/.exec(n.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${type}-${scene.id}-n${max + 1}`;
}

/** Deterministic scene id: `scene-n<1 + max existing suffix>` — stable and collision-free. */
function nextSceneId(scenes: readonly { id: string }[]): string {
  let max = 0;
  for (const s of scenes) {
    const m = /^scene-n(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `scene-n${max + 1}`;
}

function makeScene(id: string, name: string): Scene {
  return {
    id,
    name,
    nodes: [],
    durationMs: DEFAULT_SCENE_DURATION_MS,
    transition: DEFAULT_TRANSITION,
  };
}

/** Structural clone of a design so every op is non-mutating (pure). */
export function cloneDesign(design: DesignDoc): DesignDoc {
  return {
    format: design.format,
    width: design.width,
    height: design.height,
    scenes: design.scenes.map((s) => ({
      id: s.id,
      name: s.name,
      durationMs: s.durationMs,
      transition: s.transition,
      background: s.background,
      nodes: s.nodes.map((n) => ({ ...n })),
      groups: s.groups ? s.groups.map((g) => ({ ...g, ...(g.anim ? { anim: { ...g.anim } } : {}) })) : undefined,
    })),
  };
}

function assertScene(design: DesignDoc, sceneIndex: number): void {
  if (sceneIndex < 0 || sceneIndex >= design.scenes.length) {
    throw new RangeError(`scene index ${sceneIndex} out of range (0..${design.scenes.length - 1})`);
  }
}

/** Create a blank design sized to a format, with the format's initial scene count (AC8 → AC9). */
export function newDesign(format: FormatName): DesignDoc {
  const preset = getFormatPreset(format);
  return {
    format: preset.name,
    width: preset.width,
    height: preset.height,
    scenes: Array.from({ length: preset.pages }, (_, i) => makeScene(`scene-n${i + 1}`, `Scene ${i + 1}`)),
  };
}

export function addText(
  design: DesignDoc,
  sceneIndex: number,
  text: string,
  placement: NodePlacement = {},
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  scene.nodes.push({
    id: nextId("text", scene),
    type: "text",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? DEFAULT_PLACEMENT.width,
    height: placement.height ?? DEFAULT_PLACEMENT.height,
    color: placement.color ?? "#111111",
    text,
    ...stylePlacement(placement),
  });
  return next;
}

export function addShape(
  design: DesignDoc,
  sceneIndex: number,
  shape: ShapeKind,
  placement: NodePlacement = {},
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  scene.nodes.push({
    id: nextId("shape", scene),
    type: "shape",
    shape,
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 200,
    height: placement.height ?? 200,
    color: placement.color ?? "#2563eb",
    ...stylePlacement(placement),
  });
  return next;
}

// ── Editable curves (CorelDraw-style) ────────────────────────────────────────────────────────────
// A curve is a `shape` node carrying ordered `points`. It renders smoothed through the anchors
// (Catmull-Rom spline) so dragging an anchor bends the line; two anchors is a straight line.

/** Axis-aligned bounding box of a point set (min 1×1 so a degenerate curve still has a size). */
export function pointsBounds(points: CurvePoint[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = points[0].x, minY = points[0].y, maxX = points[0].x, maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** One point on the Catmull-Rom spline between p1→p2 (p0/p3 are the neighbours), at 0≤t≤1. */
function catmullRom(p0: CurvePoint, p1: CurvePoint, p2: CurvePoint, p3: CurvePoint, t: number): CurvePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/**
 * Sample the smooth curve through `points` into a dense polyline (so it can render as a Fabric
 * Polyline and export identically). 0–2 anchors pass through unchanged (a point / a straight line);
 * 3+ anchors are interpolated with a Catmull-Rom spline, `perSegment` samples per span. Pure.
 */
export function sampleCurve(points: CurvePoint[], perSegment = 18): CurvePoint[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const out: CurvePoint[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    for (let s = 0; s < perSegment; s++) out.push(catmullRom(p0, p1, p2, p3, s / perSegment));
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/** Add an editable curve — starts as a straight 2-anchor line; drag/add anchors to bend it. */
export function addCurve(design: DesignDoc, sceneIndex: number, placement: NodePlacement = {}): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const x = placement.x ?? 140;
  const y = placement.y ?? 260;
  const w = placement.width ?? 520;
  const points: CurvePoint[] = [
    { x, y: y + w * 0.15 },
    { x: x + w, y },
  ];
  const b = pointsBounds(points);
  scene.nodes.push({
    id: nextId("shape", scene),
    type: "shape",
    shape: "line",
    points,
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    stroke: placement.stroke ?? placement.color ?? "#111111",
    strokeWidth: placement.strokeWidth ?? 6,
    ...stylePlacement(placement),
  });
  return next;
}

/** Whether a node is an editable curve (a shape carrying 2+ anchor points). */
export function isCurve(node: DesignNode): boolean {
  return node.type === "shape" && Array.isArray(node.points) && node.points.length >= 2;
}

/** Replace a curve's anchor points (and re-fit its bounding box). */
export function setCurvePoints(design: DesignDoc, sceneIndex: number, nodeId: string, points: CurvePoint[]): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    const b = pointsBounds(points);
    return { ...n, points: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

/** Move one anchor of a curve to a new scene-local point. */
export function moveCurvePoint(design: DesignDoc, sceneIndex: number, nodeId: string, index: number, point: CurvePoint): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    if (!n.points || index < 0 || index >= n.points.length) return n;
    const points = n.points.map((p, i) => (i === index ? { x: Math.round(point.x), y: Math.round(point.y) } : p));
    const b = pointsBounds(points);
    return { ...n, points, x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

/** Translate every anchor of a curve by (dx, dy) — used when the whole curve is dragged. */
export function translateCurve(design: DesignDoc, sceneIndex: number, nodeId: string, dx: number, dy: number): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    if (!n.points) return n;
    const points = n.points.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
    const b = pointsBounds(points);
    return { ...n, points, x: b.x, y: b.y, width: b.width, height: b.height };
  });
}

/** Insert a new anchor on the curve nearest to `point` (splits the closest segment). */
export function insertCurveAnchor(design: DesignDoc, sceneIndex: number, nodeId: string, point: CurvePoint): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    if (!n.points || n.points.length < 2) return n;
    // Find the segment whose midpoint-projection is closest to the click, insert the anchor after it.
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n.points.length - 1; i++) {
      const a = n.points[i];
      const b = n.points[i + 1];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = (mx - point.x) ** 2 + (my - point.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const points = [...n.points.slice(0, best + 1), { x: Math.round(point.x), y: Math.round(point.y) }, ...n.points.slice(best + 1)];
    const bb = pointsBounds(points);
    return { ...n, points, x: bb.x, y: bb.y, width: bb.width, height: bb.height };
  });
}

/** Set a scene's background colour (AC9 "backgrounds"). */
export function setBackground(design: DesignDoc, sceneIndex: number, color: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  next.scenes[sceneIndex].background = color;
  return next;
}

/**
 * Add an image pulled from the approved catalog (AC9). The caller supplies the served asset URL and
 * the catalog entry id (provenance) — the studio never fabricates image sources, so only approved,
 * brand-safe assets (Contract 1, enforced server-side in services/visibility.py) reach the design.
 */
export function addCatalogImage(
  design: DesignDoc,
  sceneIndex: number,
  image: {
    src: string;
    catalogItemId: string;
    objectKey?: string;
    videoKey?: string;
    videoSrc?: string;
    kind?: "image" | "video";
  },
  placement: NodePlacement = {},
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const isVideo = image.kind === "video";
  // For a video, the clip itself is `videoSrc` (what the canvas plays); `src` keeps a poster still as
  // the serialisable fallback. `image.src` already holds the video blob URL, so fall back to it.
  const videoSrc = isVideo ? (image.videoSrc ?? image.src) : undefined;
  scene.nodes.push({
    id: nextId("image", scene),
    type: "image",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 480,
    height: placement.height ?? 480,
    // A video shows a poster still as the fallback; its clip is referenced by videoKey/videoSrc.
    src: isVideo ? VIDEO_POSTER_SRC : image.src,
    catalogItemId: image.catalogItemId,
    // Persist the stable object key so the (ephemeral) blob src can be re-resolved on reopen.
    ...(!isVideo && image.objectKey ? { objectKey: image.objectKey } : {}),
    ...(isVideo && image.videoKey ? { videoKey: image.videoKey } : {}),
    ...(videoSrc ? { videoSrc } : {}),
    ...stylePlacement(placement),
  });
  return next;
}

/** Add a built-in decorative graphic/sticker/sprite (an image node from an SVG data URL). A sprite
 * also carries an entrance/loop intent, resolved into a keyframe track anchored at its placement, or
 * a `frames` filmstrip for classic frame-by-frame sprite animation (src defaults to frame 0). */
export function addGraphic(
  design: DesignDoc,
  sceneIndex: number,
  g: {
    src?: string;
    width: number;
    height: number;
    enter?: EnterType | null;
    loop?: NodeAnimation["loop"];
    frames?: string[];
    fps?: number;
    /** A sprite id — e.g. an imported sprite `user:<id>` — so its filmstrip can re-resolve on reload. */
    sprite?: string;
  },
  placement: NodePlacement = {},
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const node: DesignNode = {
    id: nextId("image", scene),
    type: "image",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? g.width,
    height: placement.height ?? g.height,
    src: g.src ?? g.frames?.[0],
    ...(g.frames && g.frames.length > 1 ? { frames: g.frames, fps: g.fps ?? 10 } : {}),
    ...(g.sprite ? { sprite: g.sprite } : {}),
    ...stylePlacement(placement),
  };
  if (g.enter || g.loop) {
    const keyframes = g.enter ? enterTrack(node, g.enter, 0, 600).keyframes : [];
    node.anim = {
      keyframes,
      ...(g.enter ? { enter: { type: g.enter, startMs: 0, durationMs: 600, ease: "easeOut" as Easing } } : {}),
      ...(g.loop ? { loop: g.loop } : {}),
    };
  }
  scene.nodes.push(node);
  return next;
}

// ── Sprite chaining (join animations: head → successor → …) ─────────────────────────────────────
// Each member plays its filmstrip once in turn; a successor begins at its predecessor's END state
// (position / scale / rotation / opacity), so two animations read as one continuous motion.

/** A sprite's end transform (its last keyframe's values, falling back to its base) — the state a
 * successor should start from. Lightweight + pure (no engine import). */
export function spriteEndTransform(node: DesignNode): {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
} {
  const base = { x: node.x, y: node.y, scale: 1, rotation: node.angle ?? 0, opacity: node.opacity ?? 1 };
  const kfs = node.anim?.keyframes;
  if (!kfs || kfs.length === 0) return base;
  const last = kfs.reduce((a, b) => (b.t >= a.t ? b : a));
  return {
    x: last.x ?? base.x,
    y: last.y ?? base.y,
    scale: last.scale ?? base.scale,
    rotation: last.rotation ?? base.rotation,
    opacity: last.opacity ?? base.opacity,
  };
}

/** Whether a node is a frame sprite (2+ frames or a sprite id). */
export function isSprite(node: DesignNode): boolean {
  return node.type === "image" && ((node.frames?.length ?? 0) > 1 || !!node.sprite);
}

/** A sprite's play-once filmstrip length in ms (0 for a non-sprite). Mirrors anim.ts `spriteOwnMs`,
 * duplicated here to avoid an ops→anim import cycle. */
function spriteOwnDurMs(node: DesignNode): number {
  const n = node.frames?.length ?? 0;
  if (n < 2) return 0;
  const fps = node.fps && node.fps > 0 ? node.fps : 10;
  return (n / fps) * 1000;
}

/** One chain member's slot length: an explicit `chainDurMs` override, else the longer of its
 * filmstrip and its own keyframe track. Kept in sync with anim.ts `memberDurMs`. */
function memberDurMs(node: DesignNode): number {
  if (node.chainDurMs && node.chainDurMs > 0) return Math.round(node.chainDurMs);
  const anim = node.anim?.keyframes?.length ? Math.max(...node.anim.keyframes.map((k) => k.t)) : 0;
  return Math.max(spriteOwnDurMs(node), anim, 1);
}

/** A chain member's current on-stage duration (ms): its `chainDurMs` override or its filmstrip
 * length. For the duration control in the chain panel. */
export function chainMemberDurationMs(node: DesignNode): number {
  return memberDurMs(node);
}

/** Total time (ms) a sprite chain needs to play through, back-to-back, start to finish. */
export function chainTotalMs(scene: Scene, nodeId: string): number {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  return chainIds(scene, nodeId).reduce((sum, id) => {
    const n = byId.get(id);
    return sum + (n ? memberDurMs(n) : 0);
  }, 0);
}

/** The settable range for a chain member's on-stage duration (ms). */
export const MIN_CHAIN_MEMBER_MS = 200;
export const MAX_CHAIN_MEMBER_MS = 10000;

/** Grow (never shrink) a scene's duration so a sprite chain containing `nodeId` plays in full before
 * the scene loops, with a short tail so the last frame reads. Mutates `scene` in place. */
function extendSceneForChain(scene: Scene, nodeId: string): void {
  const needed = chainTotalMs(scene, nodeId) + 300;
  scene.durationMs = clampSceneDuration(Math.max(scene.durationMs, needed));
}

/** Set how long a chained sprite holds the stage before its successor starts. Clamped to a sane
 * range; the scene grows to keep the whole chain visible. Pure op (design → design). */
export function setChainDuration(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  ms: number,
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const node = scene.nodes.find((n) => n.id === nodeId);
  if (!node || !isSprite(node)) return design;
  node.chainDurMs = Math.min(MAX_CHAIN_MEMBER_MS, Math.max(MIN_CHAIN_MEMBER_MS, Math.round(ms)));
  extendSceneForChain(scene, nodeId);
  return next;
}

/** The ordered chain of sprite ids that `nodeId` belongs to (head → … → tail). A standalone sprite
 * returns just itself. Cycle-safe. */
export function chainIds(scene: Scene, nodeId: string): string[] {
  const byId = new Map(scene.nodes.map((n) => [n.id, n]));
  if (!byId.has(nodeId)) return [];
  // Walk back to the head (the node no one points at as a successor).
  const predOf = new Map<string, string>();
  for (const n of scene.nodes) if (n.successorId) predOf.set(n.successorId, n.id);
  let head = nodeId;
  const seenBack = new Set<string>();
  while (predOf.has(head) && !seenBack.has(head)) {
    seenBack.add(head);
    head = predOf.get(head)!;
  }
  // Walk forward collecting the chain.
  const ids: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = head;
  while (cur && byId.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    ids.push(cur);
    cur = byId.get(cur)!.successorId;
  }
  return ids;
}

/**
 * Add a sprite as the successor of `parentId`: a new sprite node placed at the parent's end state
 * (so the motion continues seamlessly), linked into the chain right after the parent. The parent is
 * set to play once (so it finishes before the successor starts). Returns the new design.
 */
export function addSuccessorSprite(
  design: DesignDoc,
  sceneIndex: number,
  parentId: string,
  sprite: { frames: string[]; fps?: number; width: number; height: number; spriteRef?: string },
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const parent = scene.nodes.find((n) => n.id === parentId);
  if (!parent || sprite.frames.length === 0) return design;

  const end = spriteEndTransform(parent);
  const w = Math.max(1, Math.round((parent.width || sprite.width) * end.scale));
  const h = Math.max(1, Math.round((parent.height || sprite.height) * end.scale));
  const node: DesignNode = {
    id: nextId("image", scene),
    type: "image",
    x: Math.round(end.x),
    y: Math.round(end.y),
    width: w,
    height: h,
    src: sprite.frames[0],
    frames: sprite.frames,
    fps: sprite.fps ?? 10,
    loopFrames: false,
    angle: end.rotation,
    opacity: end.opacity,
    ...(sprite.spriteRef ? { sprite: sprite.spriteRef } : {}),
  };
  // Insert into the chain right after the parent (preserving any existing successor).
  node.successorId = parent.successorId;
  parent.successorId = node.id;
  parent.loopFrames = false; // a chained sprite plays once so its successor can take over
  scene.nodes.push(node);
  extendSceneForChain(scene, parentId); // grow the scene so the whole chain actually plays
  return next;
}

/**
 * Normalise every sprite chain so each successor STARTS exactly where its predecessor ENDS: the
 * child's base transform (and its t≤0 "start" keyframe, if any) is pinned to the predecessor's end
 * state. The child's 0s state is therefore never independent — it always mirrors the parent's end.
 * Cascades head→tail (a child's end feeds its own child). Pure + deterministic; idempotent. Returns
 * the input unchanged when there are no chains, so non-chain edits don't allocate.
 */
export function syncChainStarts(design: DesignDoc): DesignDoc {
  if (!design.scenes.some((s) => s.nodes.some((n) => n.successorId))) return design;
  const next = cloneDesign(design);
  for (const scene of next.scenes) {
    const byId = new Map(scene.nodes.map((n) => [n.id, n]));
    const hasPred = new Set<string>();
    for (const n of scene.nodes) if (n.successorId && byId.has(n.successorId)) hasPred.add(n.successorId);
    for (const head of scene.nodes) {
      if (hasPred.has(head.id)) continue; // start only from a chain head
      const seen = new Set<string>();
      let cur: DesignNode | undefined = head;
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        const child: DesignNode | undefined = cur.successorId ? byId.get(cur.successorId) : undefined;
        if (child) {
          const end = spriteEndTransform(cur); // cur is already synced (we walk head→tail)
          child.x = Math.round(end.x);
          child.y = Math.round(end.y);
          child.angle = end.rotation;
          child.opacity = end.opacity;
          // Pin the child's start ("0s") keyframe to the locked start so authored motion begins there.
          if (child.anim?.keyframes?.length) {
            child.anim = {
              ...child.anim,
              keyframes: child.anim.keyframes.map((k: AnimKeyframe) =>
                k.t <= 0
                  ? { ...k, x: child.x, y: child.y, rotation: end.rotation, opacity: end.opacity, scale: end.scale }
                  : k,
              ),
            };
          }
        }
        cur = child;
      }
    }
  }
  return next;
}

/** Remove `nodeId` from its chain and delete it (its predecessor re-links to its successor). */
export function removeSuccessor(design: DesignDoc, sceneIndex: number, nodeId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const target = scene.nodes.find((n) => n.id === nodeId);
  if (!target) return design;
  for (const n of scene.nodes) if (n.successorId === nodeId) n.successorId = target.successorId;
  scene.nodes = scene.nodes.filter((n) => n.id !== nodeId);
  return next;
}

// A MEDIA-frame placeholder: a transparent frame with a dashed subtle-grey border, a photo+video
// glyph and an "Add media" prompt. Inserted as an image node flagged `placeholder: true`; clicking
// it opens the media drawer to fill it with an image OR a video. Transparent so the scene shows
// through; grey (#9ca3af) so it reads on any background.
const _GREY = "#9ca3af";
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">' +
  `<rect x="3" y="3" width="394" height="294" rx="18" fill="none" stroke="${_GREY}" ` +
  'stroke-width="3" stroke-dasharray="14 12"/>' +
  // image glyph (frame + sun + mountains)
  `<g transform="translate(192 120)" fill="none" stroke="${_GREY}" stroke-width="5" ` +
  'stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="-46" y="-30" width="92" height="64" rx="8"/><circle cx="-20" cy="-8" r="8"/>' +
  '<path d="M-46 24l24 -22 16 14 14 -12 38 30"/></g>' +
  // video play badge (signals it takes video too)
  `<g transform="translate(250 150)"><circle r="19" fill="${_GREY}"/>` +
  '<path d="M-6 -9L10 0-6 9Z" fill="#fff"/></g>' +
  `<text x="200" y="202" text-anchor="middle" font-family="'Inter',system-ui,sans-serif" ` +
  `font-size="22" font-weight="600" fill="${_GREY}">Add media</text></svg>`;

/** The data: URL shown for an unfilled media placeholder. */
export const PLACEHOLDER_SRC = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

// The poster shown on the canvas for a placed VIDEO (a dark frame + play glyph). The video itself
// is referenced by `videoKey` for a future export composite; the canvas shows this still.
const VIDEO_POSTER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">' +
  '<rect width="400" height="300" rx="14" fill="#111827"/>' +
  '<circle cx="200" cy="138" r="42" fill="#ffffff" opacity="0.95"/>' +
  '<path d="M186 116l34 22-34 22z" fill="#111827"/>' +
  '<text x="200" y="214" text-anchor="middle" font-family="\'Inter\',system-ui,sans-serif" ' +
  'font-size="20" font-weight="600" fill="#e5e7eb">Video</text></svg>';
export const VIDEO_POSTER_SRC = `data:image/svg+xml,${encodeURIComponent(VIDEO_POSTER_SVG)}`;

/** Insert an image-frame placeholder — click it on the canvas to pick a photo from the media
 * drawer, which fills it in place (via {@link fillImageNode}). */
export function addPlaceholder(design: DesignDoc, sceneIndex: number, placement: NodePlacement = {}): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  scene.nodes.push({
    id: nextId("image", scene),
    type: "image",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 440,
    height: placement.height ?? 330,
    src: PLACEHOLDER_SRC,
    placeholder: true,
    ...stylePlacement(placement),
  });
  return next;
}

/** Whether a node is an unfilled image placeholder. */
export function isPlaceholder(node: DesignNode): boolean {
  return node.type === "image" && node.placeholder === true;
}

/** Fill a media placeholder with a chosen photo or video, clearing the placeholder flag. A photo
 * records its objectKey (so it survives reload); a video shows a poster and records `videoKey`. */
export function fillImageNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  media: { src: string; objectKey?: string; catalogItemId?: string; kind?: "image" | "video" },
): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    const next: DesignNode = { ...n };
    delete next.placeholder;
    delete next.videoKey;
    delete next.videoSrc;
    if (media.kind === "video") {
      next.src = VIDEO_POSTER_SRC; // the poster is the serialisable fallback still
      next.videoSrc = media.src; // the live clip the canvas plays + the export composites
      if (media.objectKey) next.videoKey = media.objectKey;
      delete next.objectKey; // the poster is a self-contained data URL; don't re-resolve as image
    } else {
      next.src = media.src;
      if (media.objectKey) next.objectKey = media.objectKey;
      else delete next.objectKey;
    }
    if (media.catalogItemId) next.catalogItemId = media.catalogItemId;
    return next;
  });
}

/** Append a blank scene (AC46; also the pamphlet multi-page op, AC9). */
export function addScene(design: DesignDoc): DesignDoc {
  const next = cloneDesign(design);
  const id = nextSceneId(next.scenes);
  next.scenes.push(makeScene(id, `Scene ${next.scenes.length + 1}`));
  return next;
}

/** Remove a scene by index (AC46). A design always keeps at least one scene. */
export function removeScene(design: DesignDoc, sceneIndex: number): DesignDoc {
  assertScene(design, sceneIndex);
  if (design.scenes.length <= 1) {
    throw new RangeError("cannot remove the last scene");
  }
  const next = cloneDesign(design);
  next.scenes.splice(sceneIndex, 1);
  return next;
}

/** Move a scene from one position to another (AC46 reorder = rewriting the chain order). */
export function reorderScene(design: DesignDoc, from: number, to: number): DesignDoc {
  assertScene(design, from);
  if (to < 0 || to >= design.scenes.length) {
    throw new RangeError(`target index ${to} out of range (0..${design.scenes.length - 1})`);
  }
  if (from === to) return cloneDesign(design);
  const next = cloneDesign(design);
  const [moved] = next.scenes.splice(from, 1);
  next.scenes.splice(to, 0, moved);
  return next;
}

function mapScene(design: DesignDoc, sceneId: string, fn: (scene: Scene) => Scene): DesignDoc {
  const next = cloneDesign(design);
  const idx = next.scenes.findIndex((s) => s.id === sceneId);
  if (idx === -1) throw new Error(`scene ${sceneId} not found`);
  next.scenes[idx] = fn(next.scenes[idx]);
  return next;
}

/** Set a scene's lifespan (AC46), clamped to the allowed window. */
export function setSceneDuration(design: DesignDoc, sceneId: string, durationMs: number): DesignDoc {
  return mapScene(design, sceneId, (s) => ({ ...s, durationMs: clampSceneDuration(durationMs) }));
}

/** Set a scene's transition into the next scene (AC46). */
export function setSceneTransition(
  design: DesignDoc,
  sceneId: string,
  transition: TransitionKind,
): DesignDoc {
  if (!TRANSITION_KINDS.includes(transition)) {
    throw new RangeError(`unknown transition ${transition}`);
  }
  return mapScene(design, sceneId, (s) => ({ ...s, transition }));
}

/** Rename a scene (AC46). */
export function renameScene(design: DesignDoc, sceneId: string, name: string): DesignDoc {
  return mapScene(design, sceneId, (s) => ({ ...s, name }));
}

/** Set a scene's time-cued narration lines. Blank lines are kept (so a new line can be typed into);
 * an empty list clears the narration. */
export function setSceneNarration(design: DesignDoc, sceneId: string, cues: NarrationCue[]): DesignDoc {
  const kept = cues.map((c) => ({ atMs: Math.max(0, Math.round(c.atMs) || 0), text: c.text }));
  return mapScene(design, sceneId, (s) => {
    const next = { ...s };
    if (kept.length) next.narration = kept;
    else delete next.narration;
    return next;
  });
}

function mapNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  fn: (node: DesignNode) => DesignNode,
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const idx = scene.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    throw new Error(`node ${nodeId} not found on scene ${sceneIndex}`);
  }
  scene.nodes[idx] = fn(scene.nodes[idx]);
  return next;
}

/** Delete a node (entity) from a scene (AC48). Throws if the target is missing. */
export function deleteNode(design: DesignDoc, sceneIndex: number, nodeId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const idx = scene.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    throw new Error(`node ${nodeId} not found on scene ${sceneIndex}`);
  }
  scene.nodes.splice(idx, 1);
  return next;
}

/** Move a node (AC9 "move"). */
export function moveNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  x: number,
  y: number,
): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => ({ ...n, x, y }));
}

/** Resize a node (AC9 "resize"). */
export function resizeNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  width: number,
  height: number,
): DesignDoc {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`node size must be positive, got ${width}x${height}`);
  }
  return mapNode(design, sceneIndex, nodeId, (n) => ({ ...n, width, height }));
}

/** Edit a text node's text (AC9 "edit text"). Throws if the target is not a text node. */
export function editText(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  text: string,
): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    if (n.type !== "text") {
      throw new Error(`node ${nodeId} is a ${n.type} node, not editable text`);
    }
    return { ...n, text };
  });
}

/** Patch a node's style (colour, font, stroke, radius, opacity, rotation, …). Geometry and
 * identity are never written here — use move/resize for those. Undefined patch keys clear a prop. */
export function updateNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  patch: Partial<NodeStyle>,
): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    const next = { ...n };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as Record<string, unknown>)[k];
      else (next as Record<string, unknown>)[k] = v;
    }
    return next;
  });
}

/** Generate a keyframe track for a common entrance, anchored at the node's base transform. */
export function enterTrack(
  node: Pick<DesignNode, "x" | "y">,
  type: EnterType,
  startMs: number,
  durationMs: number,
  ease: Easing = "easeOut",
): NodeAnimation {
  const end = startMs + Math.max(1, durationMs);
  const from: AnimKeyframe = { t: startMs, opacity: 0 };
  const to: AnimKeyframe = { t: end, opacity: 1, ease };
  const dist = 80;
  if (type === "rise") {
    from.y = node.y + dist;
    to.y = node.y;
  } else if (type === "slide-left") {
    from.x = node.x + dist;
    to.x = node.x;
  } else if (type === "slide-right") {
    from.x = node.x - dist;
    to.x = node.x;
  } else if (type === "scale") {
    from.scale = 0.6;
    to.scale = 1;
  }
  return { keyframes: [from, to] };
}

/** Set (or clear, with `undefined`) a node's keyframe animation. Returns the new design. */
export function setNodeAnim(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  anim: NodeAnimation | undefined,
): DesignDoc {
  return mapNode(design, sceneIndex, nodeId, (n) => {
    const next = { ...n };
    if (anim && (anim.keyframes.length > 0 || anim.loop)) next.anim = anim;
    else delete next.anim;
    return next;
  });
}

// ── Nested-group hierarchy helpers (pure) — AC1/AC3/AC4 ──────────────────────────────────────────

/** Index a scene's group registry by id (tolerant of a missing `groups`). */
export function groupRegistry(scene: Scene): Map<string, SceneGroup> {
  const m = new Map<string, SceneGroup>();
  for (const g of scene.groups ?? []) if (g && typeof g.id === "string") m.set(g.id, g);
  return m;
}

/** A group's ancestry, innermost→outermost (includes the group itself first). Cycle-safe — bounded
 * by the registry size, mirroring the sprite-chain cycle guard (chainIds). */
export function groupAncestry(scene: Scene, groupId: string): SceneGroup[] {
  const reg = groupRegistry(scene);
  const out: SceneGroup[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = groupId;
  while (cur && reg.has(cur) && !seen.has(cur) && out.length <= reg.size) {
    seen.add(cur);
    const g: SceneGroup = reg.get(cur)!;
    out.push(g);
    cur = g.parentId;
  }
  return out;
}

/** The nesting depth of a group (1 = top-level). 0 for an unknown group. Drives tree indentation. */
export function groupDepth(scene: Scene, groupId: string): number {
  return groupAncestry(scene, groupId).length;
}

/** A group plus every descendant group id (for delete/duplicate/ungroup over a whole subtree). */
export function groupSubtreeIds(scene: Scene, groupId: string): string[] {
  const reg = groupRegistry(scene);
  if (!reg.has(groupId)) return [];
  const out = [groupId];
  const seen = new Set(out);
  const queue = [groupId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const g of reg.values()) {
      if (g.parentId === cur && !seen.has(g.id)) {
        seen.add(g.id);
        out.push(g.id);
        queue.push(g.id);
      }
    }
  }
  return out;
}

/** All node ids under a group (its own members + every descendant group's members), any depth. */
export function groupDescendantNodeIds(scene: Scene, groupId: string): string[] {
  const sub = new Set(groupSubtreeIds(scene, groupId));
  return scene.nodes.filter((n) => n.groupId && sub.has(n.groupId)).map((n) => n.id);
}

/** The ancestry of a node's innermost group (innermost→outermost); empty when the node is ungrouped. */
export function nodeGroupChain(scene: Scene, node: DesignNode): SceneGroup[] {
  return node.groupId ? groupAncestry(scene, node.groupId) : [];
}

/** The next free `group-N` id for a scene — scans both the registry and node tags so an empty
 * (member-less) group never collides with a reused id. */
function nextGroupId(scene: Scene): string {
  let max = 0;
  const scan = (s: string | undefined) => {
    const m = /^group-(\d+)$/.exec(s ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const g of scene.groups ?? []) scan(g.id);
  for (const n of scene.nodes) scan(n.groupId);
  return `group-${max + 1}`;
}

// ── Timing core: bake strict parent-first start-offsets into keyframes (D6) — AC4/AC5 ────────────

/** A group's effective entrance duration (ms): 0 when the group has no entrance preset. */
function groupEnterMs(g: SceneGroup | undefined): number {
  if (!g?.anim?.enter) return 0;
  return g.anim.durationMs ?? DEFAULT_GROUP_ENTER_MS;
}

/** A group's own arrival delay (ms): when the group begins appearing within its parent's timeline.
 * Independent of the entrance preset (a group can appear late with no animation). Default 0. */
function groupArrivalMs(g: SceneGroup | undefined): number {
  return Math.max(0, Math.round(g?.anim?.startMs ?? 0));
}

/** The scene-time (ms) at which a group's own context begins = Σ (arrival + entrance duration) of its
 * ANCESTORS strictly above it. A child can never appear before this — its parent's entry time — and
 * its own `startMs` (author-relative) is added on top. Top-level groups → 0. The UI uses this to
 * default + clamp a child's "Appears at" control to the parent's entry time. */
export function groupParentEntryMs(scene: Scene, groupId: string): number {
  return groupAncestry(scene, groupId)
    .slice(1)
    .reduce((s, g) => s + groupArrivalMs(g) + groupEnterMs(g), 0);
}

/** Whether an anim is a previously-baked "hold-hidden" guard (opacity-only keyframes, no entrance
 * intent). Such guards are fully recomputed each recompose, so recognising them keeps recompose
 * idempotent AND able to update a static child when an ancestor's entrance duration changes. */
function isHoldGuard(anim: NodeAnimation | undefined): boolean {
  if (!anim || anim.enter || !anim.keyframes.length) return false;
  return anim.keyframes.every(
    (k) => k.x === undefined && k.y === undefined && k.scale === undefined && k.rotation === undefined && k.opacity !== undefined,
  );
}

/**
 * Bake strict parent-first sequencing into a scene's keyframes (Approach A, D6). For each grouped
 * node the entrance start is offset by the summed entrance durations of its ANCESTOR groups (above
 * its own innermost layer), so a child stays hidden until its parent group has finished entering —
 * recursively for deeper nesting (AC4/D5). The scene's `durationMs` grows (clamped) so late children
 * aren't truncated (AC5). The engine never reads `groups`; it just plays the baked keyframes, so the
 * canvas preview and the MP4 export stay in lockstep (preview == export, Contract 4).
 *
 * Pure + idempotent: a node's `enter.startMs` is the single store of author intent and is always
 * author-relative; the baked keyframe `t` carries the ancestor offset and is recomputed every run,
 * never read back. Sprite-chain members (timed by `chainSegments`) are skipped to avoid double-offset.
 */
export function recomposeSceneGroups(scene: Scene): Scene {
  if (!scene.groups || scene.groups.length === 0) return scene;
  const reg = groupRegistry(scene);
  const chainMember = new Set<string>();
  for (const n of scene.nodes) {
    if (n.successorId) {
      chainMember.add(n.id);
      chainMember.add(n.successorId);
    }
  }
  let latestEnd = 0;
  const nodes = scene.nodes.map((n) => {
    if (!n.groupId || !reg.has(n.groupId) || chainMember.has(n.id)) return n;
    // ancestry[0] is the node's own innermost group; the rest are its ancestors (parent → root).
    // Strict parent-first start offset = each ancestor's own arrival + its entrance duration, PLUS
    // the node's innermost group's own arrival (when THAT group appears). Arrivals default 0, so this
    // is identical to the prior behaviour for any group without an explicit appearance timestamp.
    const chain = groupAncestry(scene, n.groupId);
    const startDelay =
      groupArrivalMs(chain[0]) +
      chain.slice(1).reduce((s, g) => s + groupArrivalMs(g) + groupEnterMs(g), 0);
    const en = n.anim?.enter;
    if (en) {
      const ownStart = Math.max(0, en.startMs ?? 0);
      const dur = Math.max(1, en.durationMs ?? DEFAULT_GROUP_ENTER_MS);
      const track = enterTrack(n, en.type, startDelay + ownStart, dur, en.ease);
      latestEnd = Math.max(latestEnd, startDelay + ownStart + dur);
      return {
        ...n,
        anim: {
          keyframes: track.keyframes,
          enter: { type: en.type, startMs: ownStart, durationMs: dur, ...(en.ease ? { ease: en.ease } : {}) },
          ...(n.anim?.loop ? { loop: n.anim.loop } : {}),
        },
      };
    }
    // No entrance preset. A custom dope-sheet track (motion/scale keyframes) is left untouched
    // (charter non-goal: group-level custom dope-sheets); only a static child needs a hold guard.
    const wasGuard = isHoldGuard(n.anim);
    const hasCustomTrack = !!n.anim?.keyframes.length && !wasGuard;
    if (hasCustomTrack) return n;
    const loop = n.anim?.loop;
    if (startDelay > 0) {
      const base = n.opacity ?? 1;
      latestEnd = Math.max(latestEnd, startDelay);
      return {
        ...n,
        anim: {
          keyframes: [
            { t: 0, opacity: 0 },
            { t: startDelay, opacity: 0 },
            { t: startDelay, opacity: base },
          ],
          ...(loop ? { loop } : {}),
        },
      };
    }
    // Top-level / no ancestor delay: drop a stale guard, keep a loop-only track, else leave as-is.
    if (wasGuard) {
      if (loop) return { ...n, anim: { keyframes: [], loop } };
      const copy = { ...n };
      delete copy.anim;
      return copy;
    }
    return n;
  });
  const grown =
    latestEnd > 0 ? clampSceneDuration(Math.max(scene.durationMs, latestEnd + 300)) : scene.durationMs;
  return { ...scene, nodes, durationMs: grown };
}

/** Apply {@link recomposeSceneGroups} to every scene. Returns the input unchanged (no clone) when no
 * scene has groups, so non-grouped edits don't allocate. */
export function recomposeGroups(design: DesignDoc): DesignDoc {
  if (!design.scenes.some((s) => s.groups && s.groups.length)) return design;
  const next = cloneDesign(design);
  next.scenes = next.scenes.map((s) => recomposeSceneGroups(s));
  return next;
}

/** Node ids belonging to a group, in scene order. */
export function groupMemberIds(scene: Scene, groupId: string): string[] {
  return scene.nodes.filter((n) => n.groupId === groupId).map((n) => n.id);
}

/** Group the given nodes under a fresh shared innermost groupId and register the group (AC3). When
 * every selected node already shares one innermost group `P`, the new group nests INSIDE `P`
 * (`parentId = P`) — grouping a sub-selection creates a nested child group. Otherwise the new group
 * is top-level. Baked sequencing is refreshed via `recomposeGroups`. Returns the new design. */
export function groupNodes(design: DesignDoc, sceneIndex: number, nodeIds: readonly string[]): DesignDoc {
  assertScene(design, sceneIndex);
  const ids = new Set(nodeIds);
  if (ids.size < 2) return design;
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const groups = scene.groups ?? [];

  // A group is "fully selected" when every node in its subtree is in the selection. Such a group is
  // grouped AS A UNIT (it keeps its own tag + behaviour and just gains a parent) — this is how two
  // whole groups become one nested group. A partial selection of a group's members is "loose": those
  // nodes move into the new group (the pre-nesting flatten behaviour, unchanged).
  const fullySelected = new Set(
    groups
      .filter((g) => {
        const d = groupDescendantNodeIds(scene, g.id);
        return d.length > 0 && d.every((id) => ids.has(id));
      })
      .map((g) => g.id),
  );
  // Maximal fully-selected groups: those whose parent isn't itself fully selected (avoid re-parenting
  // a group whose ancestor is already being grouped as a whole).
  const maximalGroups = [...fullySelected].filter((gid) => {
    const g = groups.find((x) => x.id === gid)!;
    return !g.parentId || !fullySelected.has(g.parentId);
  });
  // Loose nodes: selected nodes whose innermost group is NOT being grouped as a whole unit.
  const looseNodes = [...ids].filter((id) => {
    const n = scene.nodes.find((x) => x.id === id);
    return n && (!n.groupId || !fullySelected.has(n.groupId));
  });

  // Need at least two units (whole groups and/or loose nodes) to form a new group.
  if (maximalGroups.length + looseNodes.length < 2) return design;

  // Nest the new group at the units' common parent level (top-level when they don't share one).
  const parents = [
    ...maximalGroups.map((gid) => groups.find((x) => x.id === gid)!.parentId),
    ...looseNodes.map((id) => scene.nodes.find((x) => x.id === id)!.groupId),
  ];
  const parentId = parents.every((p) => p === parents[0]) ? parents[0] : undefined;

  const gid = nextGroupId(scene);
  for (const g of groups) if (maximalGroups.includes(g.id)) g.parentId = gid; // whole groups → sub-groups
  for (const n of scene.nodes) if (looseNodes.includes(n.id)) n.groupId = gid; // loose nodes → members
  scene.groups = [...groups, { id: gid, ...(parentId ? { parentId } : {}) }];
  return recomposeGroups(next);
}

/** Ungroup: remove a group and REPARENT its contents to the group's own parent (AC3). Descendant
 * groups whose `parentId === groupId` and member nodes tagged with it are lifted one level up (or
 * released to top-level when the group was top-level). Styling/animation survives. Recomposes. */
export function ungroupNodes(design: DesignDoc, sceneIndex: number, groupId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const removed = (scene.groups ?? []).find((g) => g.id === groupId);
  const newParent = removed?.parentId; // undefined ⇒ children become top-level / nodes ungrouped
  for (const n of scene.nodes) {
    if (n.groupId !== groupId) continue;
    if (newParent) n.groupId = newParent;
    else delete n.groupId;
  }
  if (scene.groups) {
    for (const g of scene.groups) if (g.parentId === groupId) g.parentId = newParent;
    scene.groups = scene.groups.filter((g) => g.id !== groupId);
    if (scene.groups.length === 0) scene.groups = undefined;
  }
  return recomposeGroups(next);
}

/** Rename a group (its tree label, AC2). */
export function renameGroup(design: DesignDoc, sceneIndex: number, groupId: string, name: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const g = (next.scenes[sceneIndex].groups ?? []).find((x) => x.id === groupId);
  if (!g) return design;
  g.name = name;
  return next;
}

/** Apply an entrance + emphasis-loop intent to every member of a group, each track anchored at the
 * member's own position (so a group rises/slides from each element's offset). Clears when neither. */
export function setGroupAnim(
  design: DesignDoc,
  sceneIndex: number,
  groupId: string,
  enter: EnterType | null,
  loop?: NodeAnimation["loop"],
  opts?: { durationMs?: number; ease?: Easing; startMs?: number },
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const durationMs = Math.max(1, Math.round(opts?.durationMs ?? DEFAULT_GROUP_ENTER_MS));
  const ease: Easing = opts?.ease ?? "easeOut";
  const startMs = Math.max(0, Math.round(opts?.startMs ?? 0)); // the group's arrival timestamp
  // Record the intent on the group registry so it round-trips (AC6) and nested timing can read the
  // group's entrance duration + arrival timestamp to offset descendants (AC4). The arrival persists
  // even with no entrance/loop (a group can simply appear late).
  const g = (scene.groups ?? []).find((x) => x.id === groupId);
  if (g) {
    if (enter || loop || startMs > 0) {
      g.anim = {
        ...(enter ? { enter, durationMs, ease } : {}),
        ...(loop ? { loop } : {}),
        ...(startMs > 0 ? { startMs } : {}),
      };
    } else {
      delete g.anim;
    }
  }
  // Stamp the group's direct members with the entrance (author-relative start 0); recompose then
  // bakes any ancestor parent-first offset into the keyframe `t`. Sprite-chain members are left to
  // the chain timeline (chainSegments) so a group entrance never fights the chain's own appearance.
  const chainMember = new Set<string>();
  for (const n of scene.nodes) {
    if (n.successorId) {
      chainMember.add(n.id);
      chainMember.add(n.successorId);
    }
  }
  for (const n of scene.nodes) {
    if (n.groupId !== groupId || chainMember.has(n.id)) continue;
    if (enter || loop) {
      const keyframes = enter ? enterTrack(n, enter, 0, durationMs, ease).keyframes : [];
      n.anim = {
        keyframes,
        ...(enter ? { enter: { type: enter, startMs: 0, durationMs, ease } } : {}),
        ...(loop ? { loop } : {}),
      };
    } else {
      delete n.anim;
    }
  }
  return recomposeGroups(next);
}

/** Patch a style property on every member of a group AND its nested sub-groups (the whole subtree). */
export function updateGroupStyle(design: DesignDoc, sceneIndex: number, groupId: string, patch: Partial<NodeStyle>): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const subtree = new Set(groupSubtreeIds(scene, groupId));
  // Fall back to the flat group id when the registry is absent (defensive for legacy scenes).
  const inScope = (gid: string | undefined) => (subtree.size ? !!gid && subtree.has(gid) : gid === groupId);
  for (const n of scene.nodes) {
    if (!inScope(n.groupId)) continue;
    const rec = n as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete rec[k];
      else rec[k] = v;
    }
  }
  return recomposeGroups(next);
}

/** Delete every member of a group and its nested sub-groups, and drop those groups from the registry. */
export function deleteGroup(design: DesignDoc, sceneIndex: number, groupId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const subtree = new Set(groupSubtreeIds(scene, groupId));
  const inScope = (gid: string | undefined) => (subtree.size ? !!gid && subtree.has(gid) : gid === groupId);
  scene.nodes = scene.nodes.filter((n) => !inScope(n.groupId));
  if (scene.groups) {
    scene.groups = scene.groups.filter((g) => !subtree.has(g.id));
    if (scene.groups.length === 0) scene.groups = undefined;
  }
  return recomposeGroups(next);
}

/** Duplicate a group's whole subtree (members + nested sub-groups), offset, as a NEW top-level group
 * above the originals. Descendant groups are cloned with fresh ids and remapped `parentId`s; every
 * copied node gets a fresh unique node id and is re-tagged to the cloned group. */
export function duplicateGroup(design: DesignDoc, sceneIndex: number, groupId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const subtree = groupSubtreeIds(scene, groupId);
  const inScope = subtree.length
    ? (gid: string | undefined) => !!gid && subtree.includes(gid)
    : (gid: string | undefined) => gid === groupId;
  const members = scene.nodes.filter((n) => inScope(n.groupId));
  if (members.length === 0) return next;

  // Map each old group id in the subtree to a fresh id (allocated in order, collision-free).
  const idMap = new Map<string, string>();
  const scanMax = () => {
    let max = 0;
    const scan = (s: string | undefined) => {
      const m = /^group-(\d+)$/.exec(s ?? "");
      if (m) max = Math.max(max, Number(m[1]));
    };
    for (const g of scene.groups ?? []) scan(g.id);
    for (const g of idMap.values()) scan(g);
    for (const n of scene.nodes) scan(n.groupId);
    return max;
  };
  const toClone = subtree.length ? subtree : [groupId];
  for (const oldId of toClone) idMap.set(oldId, `group-${scanMax() + 1}`);

  // Clone the SceneGroup entries, remapping parentId within the subtree (the subtree root becomes
  // top-level). Only clone groups that actually exist in the registry.
  if (scene.groups) {
    const reg = groupRegistry(scene);
    const clones: SceneGroup[] = [];
    for (const oldId of toClone) {
      const src = reg.get(oldId);
      if (!src) continue;
      const parent = oldId === groupId ? undefined : src.parentId ? idMap.get(src.parentId) : undefined;
      clones.push({
        ...src,
        id: idMap.get(oldId)!,
        ...(parent ? { parentId: parent } : {}),
        ...(src.anim ? { anim: { ...src.anim } } : {}),
      });
      if (oldId === groupId && clones[clones.length - 1].parentId) delete clones[clones.length - 1].parentId;
    }
    scene.groups = [...scene.groups, ...clones];
  }

  for (const src of members) {
    // Push one at a time so nextId sees the prior copy and never repeats an id.
    const mappedGid = src.groupId ? idMap.get(src.groupId) ?? idMap.get(groupId) : idMap.get(groupId);
    scene.nodes.push({ ...src, id: nextId(src.type, scene), x: src.x + 24, y: src.y + 24, groupId: mappedGid });
  }
  return recomposeGroups(next);
}

/** Duplicate a node on the same scene, offset slightly, placed just above the original. Returns
 * the new design; the copy gets a fresh unique id. */
export function duplicateNode(design: DesignDoc, sceneIndex: number, nodeId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  const idx = scene.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) throw new Error(`node ${nodeId} not found on scene ${sceneIndex}`);
  const src = scene.nodes[idx];
  const copy: DesignNode = { ...src, id: nextId(src.type, scene), x: src.x + 24, y: src.y + 24 };
  scene.nodes.splice(idx + 1, 0, copy);
  return next;
}

export type LayerMove = "forward" | "backward" | "front" | "back";

/** Reorder a node within its scene's z-stack (array order = paint order; last = top). */
export function reorderNode(
  design: DesignDoc,
  sceneIndex: number,
  nodeId: string,
  move: LayerMove,
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const nodes = next.scenes[sceneIndex].nodes;
  const i = nodes.findIndex((n) => n.id === nodeId);
  if (i === -1) throw new Error(`node ${nodeId} not found on scene ${sceneIndex}`);
  const [n] = nodes.splice(i, 1);
  const to =
    move === "front" ? nodes.length
    : move === "back" ? 0
    : move === "forward" ? Math.min(nodes.length, i + 1)
    : Math.max(0, i - 1);
  nodes.splice(to, 0, n);
  return next;
}

/**
 * The export shape the server consumes: scenes exposed as `pages` (a Scene is a superset of
 * DesignPage, so the duration/transition fields are simply ignored by PDF/HTML export).
 */
export function scenesAsPages(design: DesignDoc): Record<string, unknown> {
  return {
    format: design.format,
    width: design.width,
    height: design.height,
    pages: design.scenes.map((s) => ({ background: s.background, nodes: s.nodes })),
  };
}

/**
 * Coerce a loaded/stored design into the canonical `scenes[]` shape (AC46 migration). Accepts the
 * new shape, the legacy `{pages: [...]}` shape, or a partial/empty object, filling scene defaults
 * (id, name, durationMs, transition). Returns null when there is nothing usable to load.
 */
export function migrateDesign(raw: unknown): DesignDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const source = Array.isArray(d.scenes)
    ? (d.scenes as unknown[])
    : Array.isArray(d.pages)
      ? (d.pages as unknown[])
      : null;
  if (!source || source.length === 0) return null;

  // Format comes from untrusted stored JSON; fall back rather than throw in getFormatPreset.
  const format = isFormatName(d.format as string) ? (d.format as FormatName) : "social";
  const preset = getFormatPreset(format);
  const width = typeof d.width === "number" ? d.width : preset.width;
  const height = typeof d.height === "number" ? d.height : preset.height;

  const seenIds = new Set<string>();
  const scenes: Scene[] = source.map((p, i) => {
    const page = (p ?? {}) as Record<string, unknown>;
    const nodes = (Array.isArray(page.nodes) ? (page.nodes as unknown[]) : [])
      .filter(isDesignNode)
      .map((n) => ({ ...n }));
    const transition = TRANSITION_KINDS.includes(page.transition as TransitionKind)
      ? (page.transition as TransitionKind)
      : DEFAULT_TRANSITION;
    // Keep scene ids unique (dedupe duplicates/odd ids from hand-edited data).
    let id = typeof page.id === "string" && page.id ? page.id : `scene-n${i + 1}`;
    while (seenIds.has(id)) id = `scene-n${i + 1}-${seenIds.size}`;
    seenIds.add(id);
    // Carry the nested-group registry so group + element props round-trip (AC6, D9). Malformed
    // entries are dropped and a dangling parentId (parent no longer present) is pruned to top-level.
    const rawGroups = (Array.isArray(page.groups) ? (page.groups as unknown[]) : []).filter(isSceneGroup);
    const groupIds = new Set(rawGroups.map((g) => g.id));
    const groups = rawGroups.map((g) => {
      if (!g.parentId || groupIds.has(g.parentId)) return { ...g };
      const copy = { ...g };
      delete copy.parentId; // dangling parent → lift to top-level
      return copy;
    });
    return {
      id,
      name: typeof page.name === "string" ? page.name : `Scene ${i + 1}`,
      durationMs:
        typeof page.durationMs === "number"
          ? clampSceneDuration(page.durationMs)
          : DEFAULT_SCENE_DURATION_MS,
      transition,
      background: typeof page.background === "string" ? page.background : undefined,
      nodes,
      groups: groups.length ? groups : undefined,
    };
  });
  return { format, width, height, scenes };
}

/** A stored value is a usable group registry entry only if it has a string id (parent/name/anim are
 * optional and defensively narrowed). */
function isSceneGroup(g: unknown): g is SceneGroup {
  if (!g || typeof g !== "object") return false;
  const grp = g as Record<string, unknown>;
  if (typeof grp.id !== "string" || !grp.id) return false;
  if (grp.parentId !== undefined && typeof grp.parentId !== "string") return false;
  return true;
}

/** A stored value is a usable node only if it has a string id + a known node type. */
function isDesignNode(n: unknown): n is DesignNode {
  if (!n || typeof n !== "object") return false;
  const node = n as Record<string, unknown>;
  return (
    typeof node.id === "string" &&
    (["text", "shape", "image", "background"] as const).includes(node.type as NodeType) &&
    typeof node.x === "number" &&
    typeof node.y === "number"
  );
}
