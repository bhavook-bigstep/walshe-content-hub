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
  recomposeGroups,
  scenesAsPages,
  setBackground,
  setSceneDuration,
  migrateDesign,
  type DesignDoc,
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

// TODO(agent-ops coverage): this catalog is a DELIBERATE starter subset (6 ops). The pure op layer
// in ./ops.ts already exposes ~50+ Studio operations the agent cannot yet reach. Extend this catalog
// toward full Studio parity so the AI Builder/MCP can drive everything a human can. Known gaps:
//   • Node editing: editText, moveNode, resizeNode, updateNode (rotate/opacity/style), deleteNode,
//     duplicateNode, reorderNode (z-order).
//   • Animation: setNodeAnim / enterTrack (entrance + emphasis loop), per-node keyframes.
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
