// studio-ops — the host-agnostic agentic tool core for the Design Studio.
//
// The rich capability already exists as the PURE ops in `ops.ts` (every op takes a DesignDoc and
// returns a new one). This module turns a principled subset of them into a **typed, grounded,
// validated tool catalog** an agent can call: each op has a name, an LLM-facing description, a param
// shape, and an `apply` that delegates to the pure op. `applyStudioOps` runs a sequence of op calls,
// enforcing grounding (Contract 1 — only approved catalog items, never a fabricated image src) and
// buildability (Contract 4 — the design still migrates/round-trips), rejecting bad calls without
// aborting the batch. It is pure + deterministic, so the same calls + context always yield the same
// design (and it can be unit-tested, driven by the in-app Builder, or exposed via an MCP adapter).
import {
  addCatalogImage,
  addScene,
  addShape,
  addText,
  deleteNode,
  duplicateNode,
  editText,
  enterTrack,
  groupNodes,
  moveNode,
  recomposeGroups,
  reorderNode,
  resizeNode,
  scenesAsPages,
  setBackground,
  setGroupAnim,
  setNodeAnim,
  setSceneDuration,
  ungroupNodes,
  updateNode,
  migrateDesign,
  EASINGS,
  ENTER_TYPES,
  LOOP_TYPES,
  type DesignDoc,
  type DesignNode,
  type Easing,
  type EnterType,
  type LayerMove,
  type LoopType,
  type NodeAnimation,
  type NodeStyle,
  type ShapeKind,
} from "./ops";

/** Everything an op may need beyond its params, supplied by the host (not the model). */
export interface StudioOpContext {
  /** The scene the ops target (new nodes land here). */
  sceneIndex: number;
  /** Catalog entry ids the agent may reference. Omitted → no catalog grounding is enforced (e.g. a
   *  free-compose with no selected items); present → a referenced id MUST be in this set. */
  allowedCatalogIds?: ReadonlySet<string>;
  /** Resolve a catalog id → its served image src. The studio NEVER fabricates an image source, so a
   *  `place` whose id doesn't resolve here is rejected. */
  imageSrcFor?: (catalogItemId: string) => string | undefined;
}

/** A single op call from the agent: an op name + its params. */
export interface StudioOpCall {
  op: string;
  [param: string]: unknown;
}

export type StudioOpStatus = "applied" | "rejected";

export interface StudioOpResult {
  op: string;
  status: StudioOpStatus;
  /** Why it was rejected (grounding/validation), for the agent to self-correct. */
  reason?: string;
}

export interface ApplyStudioOpsResult {
  design: DesignDoc;
  results: StudioOpResult[];
  /** True when the final design round-trips through migrateDesign (buildability, Contract 4). */
  valid: boolean;
}

/** A rejected op throws this; the batch records it and keeps the prior design. */
class OpRejected extends Error {}
function reject(reason: string): never {
  throw new OpRejected(reason);
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim() === "") reject(`${field} must be a non-empty string`);
  return v as string;
}
function num(v: unknown, field: string, fallback?: number): number {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "number" || !Number.isFinite(v)) reject(`${field} must be a number`);
  return v as number;
}

/** Placement params shared by node-creating ops (all optional; the pure op fills defaults). */
function placement(c: StudioOpCall): { x?: number; y?: number; width?: number; height?: number; color?: string } {
  const p: { x?: number; y?: number; width?: number; height?: number; color?: string } = {};
  if (c.x !== undefined) p.x = num(c.x, "x");
  if (c.y !== undefined) p.y = num(c.y, "y");
  if (c.width !== undefined) p.width = num(c.width, "width");
  if (c.height !== undefined) p.height = num(c.height, "height");
  if (c.color !== undefined) p.color = str(c.color, "color");
  return p;
}

interface OpDef {
  /** The LLM-facing description of what the op does (used to build the tool catalog). */
  description: string;
  /** Param hints for the catalog spec (name → short description). */
  params: Record<string, string>;
  apply(design: DesignDoc, call: StudioOpCall, ctx: StudioOpContext): DesignDoc;
}

const SHAPES: ReadonlySet<string> = new Set<ShapeKind>(["rect", "ellipse", "line"]);
const LAYER_MOVES: ReadonlySet<string> = new Set<LayerMove>(["forward", "backward", "front", "back"]);
const ENTERS: ReadonlySet<string> = new Set<EnterType>(ENTER_TYPES);
const LOOPS: ReadonlySet<string> = new Set<LoopType>(LOOP_TYPES);
const EASES: ReadonlySet<string> = new Set<Easing>(EASINGS);
// Style keys an agent may patch, split by value type so each is validated with str()/num().
const STR_STYLE = ["color", "fontFamily", "fontWeight", "fontStyle", "textAlign", "stroke"] as const;
const NUM_STYLE = ["fontSize", "lineHeight", "opacity", "angle", "radius", "strokeWidth"] as const;

/** Resolve a node on the target scene, or reject with a clear reason the agent can act on. The
 *  editing ops target EXISTING nodes by the id the agent reads from `observe`. */
function findNode(design: DesignDoc, sceneIndex: number, nodeId: string): DesignNode {
  const node = design.scenes[sceneIndex]?.nodes.find((n) => n.id === nodeId);
  if (!node) reject(`node_id ${nodeId} not found on the current scene`);
  return node;
}

// TODO(agent-ops coverage): this catalog is a GROWING subset en route to full Studio parity. The
// pure op layer in ./ops.ts exposes ~50+ operations; keep extending so the AI Builder/MCP can drive
// everything a human can. Covered so far: add ops (write-copy/place/add-shape/set-background), scene
// ops, node editing (edit/move/resize/style/delete/duplicate/reorder), animation (animate-node +
// clear-animation), grouping (group-nodes/ungroup/set-group-anim). Remaining gaps:
//   • Sprites + chains (addGraphic, addSuccessorSprite, setChainDuration, removeSuccessor).
//   • Curves (addCurve + anchor/point editing); image fill (addPlaceholder, fillImageNode).
//   • Raw keyframe dope-sheet editing (per-node AnimKeyframe tracks beyond the entrance preset).
//   • Groups & nesting: groupNodes, ungroupNodes, renameGroup, setGroupAnim, updateGroupStyle,
//     deleteGroup, duplicateGroup (recompose stays automatic).
//   • Sprites: addGraphic + sprite chains (addSuccessorSprite, setChainDuration, removeSuccessor).
//   • Curves: addCurve, setCurvePoints, insertCurveAnchor, translate/moveCurvePoint.
//   • Scenes: removeScene, reorderScene, setSceneTransition, renameScene, setSceneNarration.
//   • Images: addPlaceholder, fillImageNode (grounded).
// Each stays host-agnostic (workspace-JSON in/out, pure op) and keeps Contract 1 grounding for any op
// that references a catalog item. See docs/plans/2026-10-12-agentic-studio-harness-rnd.md.
/** The op catalog. Add an entry here to expose another pure op as an agent tool. */
const OPS: Record<string, OpDef> = {
  "write-copy": {
    description:
      "Add a line of text to the current scene. Only use words grounded in the brief or a referenced catalog item — never invent facts, stats, or prices.",
    params: { text: "the copy to place", item_id: "optional catalog id this copy is about", x: "optional", y: "optional", width: "optional" },
    apply(design, call, ctx) {
      const text = str(call.text, "text");
      if (call.item_id != null) {
        const id = String(call.item_id);
        if (ctx.allowedCatalogIds && !ctx.allowedCatalogIds.has(id)) {
          reject(`item_id ${id} is not an approved catalog item`);
        }
      }
      return addText(design, ctx.sceneIndex, text, placement(call));
    },
  },

  place: {
    description:
      "Place an approved catalog item's image on the current scene. The image source comes only from the catalog — it is never fabricated.",
    params: { item_id: "the catalog id to place (must be approved)", x: "optional", y: "optional", width: "optional", height: "optional" },
    apply(design, call, ctx) {
      if (call.item_id == null) reject("place requires item_id");
      const id = String(call.item_id);
      if (ctx.allowedCatalogIds && !ctx.allowedCatalogIds.has(id)) {
        reject(`item_id ${id} is not an approved catalog item`);
      }
      const src = ctx.imageSrcFor?.(id);
      if (!src) reject(`no image source for item_id ${id} (the studio never fabricates image sources)`);
      const p = placement(call);
      return addCatalogImage(
        design,
        ctx.sceneIndex,
        { src, catalogItemId: id },
        { x: p.x, y: p.y, width: p.width ?? 480, height: p.height ?? 480 },
      );
    },
  },

  "add-shape": {
    description: "Add a decorative shape (rect, ellipse, or line) to the current scene.",
    params: { shape: "rect | ellipse | line", x: "optional", y: "optional", width: "optional", height: "optional", color: "optional hex" },
    apply(design, call, ctx) {
      const shape = str(call.shape, "shape");
      if (!SHAPES.has(shape)) reject(`shape must be one of rect, ellipse, line`);
      return addShape(design, ctx.sceneIndex, shape as ShapeKind, placement(call));
    },
  },

  "set-background": {
    description: "Set the current scene's background colour.",
    params: { color: "hex colour, e.g. #0e2a26" },
    apply(design, call, ctx) {
      return setBackground(design, ctx.sceneIndex, str(call.color, "color"));
    },
  },

  "add-scene": {
    description: "Append a new blank scene to the design (does not change the targeted scene index).",
    params: {},
    apply(design) {
      return addScene(design);
    },
  },

  "set-scene-duration": {
    description: "Set a scene's on-screen duration in milliseconds (clamped to the allowed range).",
    params: { scene_id: "the scene's id", duration_ms: "milliseconds" },
    apply(design, call) {
      const sceneId = str(call.scene_id, "scene_id");
      if (!design.scenes.some((s) => s.id === sceneId)) reject(`unknown scene_id ${sceneId}`);
      return setSceneDuration(design, sceneId, num(call.duration_ms, "duration_ms"));
    },
  },

  // ── Node editing (target EXISTING nodes by the id read from `observe`) ──
  "edit-text": {
    description: "Replace the copy of an existing text node. Only words grounded in the brief or a referenced catalog item.",
    params: { node_id: "the text node's id (from observe)", text: "the new copy" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      const node = findNode(design, ctx.sceneIndex, nodeId);
      if (node.type !== "text") reject(`node ${nodeId} is a ${node.type} node, not editable text`);
      return editText(design, ctx.sceneIndex, nodeId, str(call.text, "text"));
    },
  },

  "move-node": {
    description: "Move an existing node to a new x,y on the current scene.",
    params: { node_id: "the node's id (from observe)", x: "new x", y: "new y" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      return moveNode(design, ctx.sceneIndex, nodeId, num(call.x, "x"), num(call.y, "y"));
    },
  },

  "resize-node": {
    description: "Resize an existing node (width/height in canvas units; both must be positive).",
    params: { node_id: "the node's id", width: "new width (>0)", height: "new height (>0)" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      const w = num(call.width, "width");
      const h = num(call.height, "height");
      if (w <= 0 || h <= 0) reject("width and height must be positive");
      return resizeNode(design, ctx.sceneIndex, nodeId, w, h);
    },
  },

  "style-node": {
    description: "Patch style on an existing node (colour, font, stroke, radius, opacity, rotation). Only the keys you pass change.",
    params: {
      node_id: "the node's id",
      color: "optional hex", fontSize: "optional px", fontWeight: "optional normal|bold",
      textAlign: "optional left|center|right", opacity: "optional 0..1", angle: "optional degrees",
    },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      const patch: Record<string, unknown> = {};
      for (const k of STR_STYLE) if (call[k] !== undefined) patch[k] = str(call[k], k);
      for (const k of NUM_STYLE) if (call[k] !== undefined) patch[k] = num(call[k], k);
      if (Object.keys(patch).length === 0) reject("style-node needs at least one style key to patch");
      return updateNode(design, ctx.sceneIndex, nodeId, patch as Partial<NodeStyle>);
    },
  },

  "delete-node": {
    description: "Delete an existing node from the current scene.",
    params: { node_id: "the node's id (from observe)" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      return deleteNode(design, ctx.sceneIndex, nodeId);
    },
  },

  "duplicate-node": {
    description: "Duplicate an existing node on the same scene (the copy is offset and gets a fresh id).",
    params: { node_id: "the node's id to copy" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      return duplicateNode(design, ctx.sceneIndex, nodeId);
    },
  },

  "reorder-node": {
    description: "Change a node's z-order (paint order) within the current scene.",
    params: { node_id: "the node's id", move: "front | back | forward | backward" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      const move = str(call.move, "move");
      if (!LAYER_MOVES.has(move)) reject("move must be one of front, back, forward, backward");
      return reorderNode(design, ctx.sceneIndex, nodeId, move as LayerMove);
    },
  },

  // ── Animation (entrance + emphasis loop on an existing node) ──
  "animate-node": {
    description: "Give an existing node an entrance animation and/or an emphasis loop. At least one of enter or loop is required.",
    params: {
      node_id: "the node's id (from observe)",
      enter: "optional entrance: fade | rise | slide-left | slide-right | scale",
      start_ms: "optional entrance start (ms, default 0)",
      duration_ms: "optional entrance duration (ms, default 600)",
      ease: "optional: linear | easeIn | easeOut | easeInOut | back | bounce",
      loop: "optional emphasis loop: pulse|bob|sway|waddle|float|spin|twinkle|drift|rock",
      loop_period_ms: "optional loop period (ms, default 1200)",
    },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      const node = findNode(design, ctx.sceneIndex, nodeId);
      let enter: EnterType | undefined;
      if (call.enter != null) {
        const e = str(call.enter, "enter");
        if (!ENTERS.has(e)) reject(`enter must be one of ${ENTER_TYPES.join(", ")}`);
        enter = e as EnterType;
      }
      let loopType: LoopType | undefined;
      if (call.loop != null) {
        const l = str(call.loop, "loop");
        if (!LOOPS.has(l)) reject(`loop must be one of ${LOOP_TYPES.join(", ")}`);
        loopType = l as LoopType;
      }
      if (!enter && !loopType) reject("animate-node needs an entrance (enter) or an emphasis loop");
      let ease: Easing | undefined;
      if (call.ease != null) {
        const es = str(call.ease, "ease");
        if (!EASES.has(es)) reject(`ease must be one of ${EASINGS.join(", ")}`);
        ease = es as Easing;
      }
      const startMs = Math.max(0, num(call.start_ms, "start_ms", 0));
      const durationMs = Math.max(1, num(call.duration_ms, "duration_ms", 600));
      const keyframes = enter ? enterTrack(node, enter, startMs, durationMs, ease).keyframes : [];
      const anim: NodeAnimation = {
        keyframes,
        ...(enter ? { enter: { type: enter, startMs, durationMs, ...(ease ? { ease } : {}) } } : {}),
        ...(loopType ? { loop: { type: loopType, periodMs: num(call.loop_period_ms, "loop_period_ms", 1200) } } : {}),
      };
      return setNodeAnim(design, ctx.sceneIndex, nodeId, anim);
    },
  },

  "clear-animation": {
    description: "Remove all animation (entrance + loop + keyframes) from an existing node.",
    params: { node_id: "the node's id (from observe)" },
    apply(design, call, ctx) {
      const nodeId = str(call.node_id, "node_id");
      findNode(design, ctx.sceneIndex, nodeId);
      return setNodeAnim(design, ctx.sceneIndex, nodeId, undefined);
    },
  },

  // ── Grouping (nest elements; sequence a group's entrance before its children) ──
  "group-nodes": {
    description: "Group 2+ existing nodes so they move and animate together. Returns the design; read the new group's id from a follow-up observe.",
    params: { node_ids: "array of 2+ node ids to group (from observe)" },
    apply(design, call, ctx) {
      if (!Array.isArray(call.node_ids)) reject("node_ids must be an array of node ids");
      const ids = (call.node_ids as unknown[]).map(String);
      if (ids.length < 2) reject("group-nodes needs at least 2 node ids");
      for (const id of ids) findNode(design, ctx.sceneIndex, id);
      const next = groupNodes(design, ctx.sceneIndex, ids);
      if (next === design) reject("those nodes could not be grouped (need 2+ distinct units)");
      return next;
    },
  },

  ungroup: {
    description: "Ungroup a group: release its members (and lift any nested sub-groups one level up).",
    params: { group_id: "the group's id (from observe)" },
    apply(design, call, ctx) {
      const groupId = str(call.group_id, "group_id");
      if (!(design.scenes[ctx.sceneIndex]?.groups ?? []).some((g) => g.id === groupId)) {
        reject(`group_id ${groupId} not found on the current scene`);
      }
      return ungroupNodes(design, ctx.sceneIndex, groupId);
    },
  },

  "set-group-anim": {
    description: "Set a group's entrance and/or emphasis loop. The group animates FIRST, then its children play (strict parent-first).",
    params: {
      group_id: "the group's id (from observe)",
      enter: "optional entrance: fade | rise | slide-left | slide-right | scale (omit + no loop/start to clear)",
      duration_ms: "optional entrance duration (ms)",
      ease: "optional easing",
      start_ms: "optional: how long the whole group stays hidden before it appears (ms)",
      loop: "optional emphasis loop applied to members",
      loop_period_ms: "optional loop period (ms, default 1200)",
    },
    apply(design, call, ctx) {
      const groupId = str(call.group_id, "group_id");
      if (!(design.scenes[ctx.sceneIndex]?.groups ?? []).some((g) => g.id === groupId)) {
        reject(`group_id ${groupId} not found on the current scene`);
      }
      let enter: EnterType | null = null;
      if (call.enter != null) {
        const e = str(call.enter, "enter");
        if (!ENTERS.has(e)) reject(`enter must be one of ${ENTER_TYPES.join(", ")}`);
        enter = e as EnterType;
      }
      let loop: NodeAnimation["loop"] | undefined;
      if (call.loop != null) {
        const l = str(call.loop, "loop");
        if (!LOOPS.has(l)) reject(`loop must be one of ${LOOP_TYPES.join(", ")}`);
        loop = { type: l as LoopType, periodMs: num(call.loop_period_ms, "loop_period_ms", 1200) };
      }
      let ease: Easing | undefined;
      if (call.ease != null) {
        const es = str(call.ease, "ease");
        if (!EASES.has(es)) reject(`ease must be one of ${EASINGS.join(", ")}`);
        ease = es as Easing;
      }
      const opts: { durationMs?: number; ease?: Easing; startMs?: number } = {};
      if (call.duration_ms != null) opts.durationMs = num(call.duration_ms, "duration_ms");
      if (ease) opts.ease = ease;
      if (call.start_ms != null) opts.startMs = num(call.start_ms, "start_ms");
      return setGroupAnim(design, ctx.sceneIndex, groupId, enter, loop, opts);
    },
  },
};

/** The serializable catalog spec (op name + description + params) — for building an LLM tool list,
 *  an MCP tool manifest, or docs. Contains no functions, so it crosses the host boundary cleanly. */
export const STUDIO_OPS_SPEC: Array<{ op: string; description: string; params: Record<string, string> }> =
  Object.entries(OPS).map(([op, def]) => ({ op, description: def.description, params: def.params }));

/** A design is "buildable" when it round-trips through the load guard unchanged in scene count — our
 *  cheap analogue of the reference's "the edit still builds" check (Contract 4). */
export function validateDesign(design: DesignDoc): boolean {
  try {
    const raw = JSON.parse(JSON.stringify(scenesAsPages(design)));
    const back = migrateDesign(raw);
    return !!back && back.scenes.length === design.scenes.length;
  } catch {
    return false;
  }
}

/**
 * Apply a sequence of agent op calls to a design, enforcing grounding + buildability. Unknown ops and
 * ops that fail validation are rejected (recorded with a reason) and leave the design untouched, so a
 * bad call never aborts the batch. Groups are recomposed at the end so sequenced animation is baked.
 * Pure: never mutates `design`.
 */
export function applyStudioOps(
  design: DesignDoc,
  calls: readonly StudioOpCall[],
  ctx: StudioOpContext,
): ApplyStudioOpsResult {
  let next = design;
  const results: StudioOpResult[] = [];
  for (const call of calls) {
    const def = OPS[call.op];
    if (!def) {
      results.push({ op: call.op, status: "rejected", reason: `unknown op "${call.op}"` });
      continue;
    }
    try {
      const candidate = def.apply(next, call, ctx);
      // Guard buildability per-op: a call that breaks the design is rejected, not kept.
      if (!validateDesign(candidate)) reject("op would produce an invalid design");
      next = candidate;
      results.push({ op: call.op, status: "applied" });
    } catch (e) {
      const reason = e instanceof OpRejected ? e.message : "op failed to apply";
      results.push({ op: call.op, status: "rejected", reason });
    }
  }
  next = recomposeGroups(next);
  return { design: next, results, valid: validateDesign(next) };
}
