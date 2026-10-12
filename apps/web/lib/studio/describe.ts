// Scene description — a PURE, deterministic projection of a scene's structured state into words, so
// an agent can "observe" the workspace by reading an accurate description instead of analysing a
// render. It is never hand-edited or patched incrementally (that would drift): it is RECOMPUTED from
// the scene whenever the scene changes, which is what makes it always accurate. The same function
// feeds the stored `scene.description` (refreshed on autosave) and the on-demand `observe` tool.
//
// Deterministic (Contract 4): same scene + options → identical text. No clock, no randomness, no DOM.
import {
  type DesignDoc,
  type DesignNode,
  type Scene,
  type SceneGroup,
  narrationCues,
} from "./ops";

export interface DescribeOptions {
  /** canvas width/height, for bucketing a node's position into words (top/left/…). */
  width: number;
  height: number;
  /** catalog item id → title, so placed images read as "photo of <title>" not "catalog item 7". */
  labels?: Record<string, string>;
}

export interface SceneObservation {
  index: number;
  name: string;
  description: string;
  durationMs: number;
  transition: string;
  background?: string;
  nodeCount: number;
  /** element counts by node type (text/image/shape/background). */
  elements: Record<string, number>;
  groupCount: number;
}

export interface DesignObservation {
  format: string;
  width: number;
  height: number;
  sceneCount: number;
  scenes: SceneObservation[];
}

function round(n: number): number {
  return Math.round(n);
}

/** Bucket a node's CENTRE into a coarse position phrase ("upper-left", "centre", "lower-right"). */
function positionPhrase(node: DesignNode, width: number, height: number): string {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const col = cx < width / 3 ? "left" : cx > (2 * width) / 3 ? "right" : "centre";
  const row = cy < height / 3 ? "upper" : cy > (2 * height) / 3 ? "lower" : "middle";
  if (row === "middle" && col === "centre") return "centre";
  return `${row}-${col}`;
}

/** A rough size phrase from the node's area as a fraction of the canvas. */
function sizePhrase(node: DesignNode, width: number, height: number): string {
  const frac = (node.width * node.height) / (width * height || 1);
  if (frac >= 0.6) return "very large";
  if (frac >= 0.25) return "large";
  if (frac >= 0.08) return "medium";
  return "small";
}

function truncate(text: string, max = 80): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The animation clause for a node: entrance preset + timing, a motion path, and any emphasis loop. */
function animPhrase(node: DesignNode): string {
  const a = node.anim;
  if (!a) return "";
  const parts: string[] = [];
  if (a.enter) {
    const verb: Record<string, string> = {
      fade: "fades in",
      rise: "rises in",
      "slide-left": "slides in from the right",
      "slide-right": "slides in from the left",
      scale: "scales up",
    };
    const start = a.enter.startMs ? ` at ${round(a.enter.startMs)}ms` : "";
    parts.push(`${verb[a.enter.type] ?? "animates in"}${start} over ${round(a.enter.durationMs)}ms`);
  } else if (a.keyframes && a.keyframes.length > 1) {
    parts.push("moves along a path");
  }
  if (a.loop) parts.push(`with a ${a.loop.type} loop`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Describe one node as a single clause. */
function describeNode(node: DesignNode, opts: DescribeOptions): string {
  const pos = positionPhrase(node, opts.width, opts.height);
  const size = sizePhrase(node, opts.width, opts.height);
  const anim = animPhrase(node);
  if (node.type === "text") {
    const copy = node.text ? `"${truncate(node.text)}"` : "(empty)";
    const weight = node.fontWeight === "bold" ? "bold " : "";
    return `${weight}text ${copy} — ${pos}, ${size}${anim}`;
  }
  if (node.type === "image") {
    if (node.placeholder) return `an empty media placeholder — ${pos}, ${size}${anim}`;
    if (node.videoKey || node.videoSrc) return `a video clip — ${pos}, ${size}${anim}`;
    if (node.frames?.length || node.sprite) {
      const chain = node.successorId ? ", then hands off to the next sprite" : "";
      return `an animated sprite — ${pos}, ${size}${anim}${chain}`;
    }
    const id = node.catalogItemId;
    const label = id ? opts.labels?.[id] : undefined;
    const subject = label ? `photo of "${truncate(label, 48)}"` : id ? `catalog image #${id}` : "an image";
    return `${subject} — ${pos}, ${size}${anim}`;
  }
  if (node.type === "shape") {
    const kind = node.points && node.points.length > 1 ? "a curve/line" : (node.shape ?? "shape");
    const colour = node.color ? ` (${node.color})` : "";
    return `${kind}${colour} — ${pos}, ${size}${anim}`;
  }
  return `${node.type} — ${pos}, ${size}${anim}`;
}

/** Describe the scene's group tree (nesting + which group animates first). */
function describeGroups(groups: SceneGroup[] | undefined): string[] {
  if (!groups || groups.length === 0) return [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const lines: string[] = [];
  for (const g of groups) {
    const nesting = g.parentId && byId.has(g.parentId) ? ` (nested in ${byId.get(g.parentId)!.name ?? g.parentId})` : "";
    const entrance = g.anim?.enter ? `, enters first (${g.anim.enter})` : "";
    lines.push(`group "${g.name ?? g.id}"${nesting}${entrance}`);
  }
  return lines;
}

/** DERIVE the natural-language description of a scene from its current state. */
export function describeScene(scene: Scene, opts: DescribeOptions): string {
  const seconds = (scene.durationMs / 1000).toFixed(1);
  const header = `Scene "${scene.name}" — ${seconds}s, ${scene.transition} into the next.`;
  const bg = scene.background ? ` Background ${scene.background}.` : "";
  const nodes = scene.nodes;
  if (nodes.length === 0) {
    return `${header}${bg} Empty canvas (no elements yet).`;
  }
  const elementLines = nodes.map((n) => `- ${describeNode(n, opts)}`);
  const groupLines = describeGroups(scene.groups);
  const narration = narrationCues(scene).filter((c) => c.text.trim());
  const parts = [
    `${header}${bg} ${nodes.length} element${nodes.length === 1 ? "" : "s"}:`,
    ...elementLines,
  ];
  if (groupLines.length) parts.push(`Groups: ${groupLines.join("; ")}.`);
  if (narration.length) parts.push(`Narration: ${narration.map((c) => `"${truncate(c.text, 60)}"`).join(" ")}`);
  return parts.join("\n");
}

function elementCounts(scene: Scene): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const n of scene.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;
  return counts;
}

/** A structured, context-cheap observation of the whole design (per-scene description + counts). */
export function observeDesign(design: DesignDoc, labels?: Record<string, string>): DesignObservation {
  const opts: DescribeOptions = { width: design.width, height: design.height, labels };
  return {
    format: design.format,
    width: design.width,
    height: design.height,
    sceneCount: design.scenes.length,
    scenes: design.scenes.map((scene, index) => ({
      index,
      name: scene.name,
      description: describeScene(scene, opts),
      durationMs: scene.durationMs,
      transition: scene.transition,
      background: scene.background,
      nodeCount: scene.nodes.length,
      elements: elementCounts(scene),
      groupCount: scene.groups?.length ?? 0,
    })),
  };
}

/** Return a copy of the design with every scene's `description` refreshed from its current state.
 * Called wherever the design is persisted (autosave) so the stored description never drifts. */
export function refreshDescriptions(design: DesignDoc, labels?: Record<string, string>): DesignDoc {
  const opts: DescribeOptions = { width: design.width, height: design.height, labels };
  return {
    ...design,
    scenes: design.scenes.map((scene) => ({ ...scene, description: describeScene(scene, opts) })),
  };
}
