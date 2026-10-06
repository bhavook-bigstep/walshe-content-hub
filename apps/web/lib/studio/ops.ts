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

  /** optional keyframe animation (position/scale/rotation/opacity over time within the scene) */
  anim?: NodeAnimation;
  /** group membership — nodes sharing a groupId move/animate together (flat; no nested groups) */
  groupId?: string;
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
  image: { src: string; catalogItemId: string; objectKey?: string },
  placement: NodePlacement = {},
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  scene.nodes.push({
    id: nextId("image", scene),
    type: "image",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 480,
    height: placement.height ?? 480,
    src: image.src,
    catalogItemId: image.catalogItemId,
    // Persist the stable object key so the (ephemeral) blob src can be re-resolved on reopen.
    ...(image.objectKey ? { objectKey: image.objectKey } : {}),
    ...stylePlacement(placement),
  });
  return next;
}

/** Add a built-in decorative graphic/sticker/sprite (an image node from an SVG data URL). A sprite
 * also carries an entrance/loop intent, resolved into a keyframe track anchored at its placement. */
export function addGraphic(
  design: DesignDoc,
  sceneIndex: number,
  g: { src: string; width: number; height: number; enter?: EnterType | null; loop?: NodeAnimation["loop"] },
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
    src: g.src,
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

/** Node ids belonging to a group, in scene order. */
export function groupMemberIds(scene: Scene, groupId: string): string[] {
  return scene.nodes.filter((n) => n.groupId === groupId).map((n) => n.id);
}

/** Group the given nodes (flat, no nesting): assign them all a fresh shared groupId, replacing any
 * existing group tags. Returns the new design. */
export function groupNodes(design: DesignDoc, sceneIndex: number, nodeIds: readonly string[]): DesignDoc {
  assertScene(design, sceneIndex);
  const ids = new Set(nodeIds);
  if (ids.size < 2) return design;
  const next = cloneDesign(design);
  const scene = next.scenes[sceneIndex];
  let max = 0;
  for (const n of scene.nodes) {
    const m = /^group-(\d+)$/.exec(n.groupId ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  const gid = `group-${max + 1}`;
  for (const n of scene.nodes) if (ids.has(n.id)) n.groupId = gid;
  return next;
}

/** Remove a group's tag from all its members (ungroup). */
export function ungroupNodes(design: DesignDoc, sceneIndex: number, groupId: string): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  for (const n of next.scenes[sceneIndex].nodes) if (n.groupId === groupId) delete n.groupId;
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
): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  for (const n of next.scenes[sceneIndex].nodes) {
    if (n.groupId !== groupId) continue;
    if (enter || loop) {
      const keyframes = enter ? enterTrack(n, enter, 0, 600).keyframes : [];
      n.anim = {
        keyframes,
        ...(enter ? { enter: { type: enter, startMs: 0, durationMs: 600, ease: "easeOut" as Easing } } : {}),
        ...(loop ? { loop } : {}),
      };
    } else {
      delete n.anim;
    }
  }
  return next;
}

/** Patch a style property on every member of a group (e.g. opacity). */
export function updateGroupStyle(design: DesignDoc, sceneIndex: number, groupId: string, patch: Partial<NodeStyle>): DesignDoc {
  assertScene(design, sceneIndex);
  const next = cloneDesign(design);
  for (const n of next.scenes[sceneIndex].nodes) {
    if (n.groupId !== groupId) continue;
    const rec = n as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete rec[k];
      else rec[k] = v;
    }
  }
  return next;
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
    };
  });
  return { format, width, height, scenes };
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
