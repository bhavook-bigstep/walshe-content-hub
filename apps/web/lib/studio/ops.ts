/**
 * Manual-mode Design Studio operations (AC9).
 *
 * The studio edits a **serialisable design model** — not the live Fabric.js canvas directly — so
 * every operation is a pure, deterministic function (design in → new design out). This is what
 * makes the studio testable in vitest without a DOM/canvas (jsdom has no canvas), and it is the
 * exact shape the API's PDF/HTML export consumes
 * (apps/api/app/media/pdf.py: `{"pages": [{"nodes": [{"type": "text", "text": "..."}]}]}`).
 *
 * Determinism (Contract 4 / testing rule): node ids are derived from the page's current node count,
 * never from Math.random()/Date.now(), so the same sequence of ops yields byte-identical output.
 */

import { getFormatPreset, type FormatName } from "./formats";

export type NodeType = "text" | "shape" | "image" | "background";
export type ShapeKind = "rect" | "ellipse" | "line";

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
  /** image nodes only — the served catalog asset URL */
  src?: string;
  /** image nodes only — provenance back to the approved catalog entry */
  catalogItemId?: string;
}

export interface DesignPage {
  /** page background colour; undefined = transparent/white */
  background?: string;
  nodes: DesignNode[];
}

export interface DesignDoc {
  format: FormatName;
  width: number;
  height: number;
  pages: DesignPage[];
}

export interface NodePlacement {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
}

const DEFAULT_PLACEMENT = { x: 64, y: 64, width: 320, height: 96 } as const;

/** Deterministic id: `<type>-p<pageIndex>-n<countOnPage>` — stable for a given op sequence. */
function nextId(type: NodeType, pageIndex: number, page: DesignPage): string {
  return `${type}-p${pageIndex}-n${page.nodes.length + 1}`;
}

function emptyPage(): DesignPage {
  return { nodes: [] };
}

/** Structural clone of a design so every op is non-mutating (pure). */
function cloneDesign(design: DesignDoc): DesignDoc {
  return {
    format: design.format,
    width: design.width,
    height: design.height,
    pages: design.pages.map((p) => ({
      background: p.background,
      nodes: p.nodes.map((n) => ({ ...n })),
    })),
  };
}

function assertPage(design: DesignDoc, pageIndex: number): void {
  if (pageIndex < 0 || pageIndex >= design.pages.length) {
    throw new RangeError(`page index ${pageIndex} out of range (0..${design.pages.length - 1})`);
  }
}

/** Create a blank design sized to a format, with the format's initial page count (AC8 → AC9). */
export function newDesign(format: FormatName): DesignDoc {
  const preset = getFormatPreset(format);
  return {
    format: preset.name,
    width: preset.width,
    height: preset.height,
    pages: Array.from({ length: preset.pages }, emptyPage),
  };
}

export function addText(
  design: DesignDoc,
  pageIndex: number,
  text: string,
  placement: NodePlacement = {},
): DesignDoc {
  assertPage(design, pageIndex);
  const next = cloneDesign(design);
  const page = next.pages[pageIndex];
  page.nodes.push({
    id: nextId("text", pageIndex, page),
    type: "text",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? DEFAULT_PLACEMENT.width,
    height: placement.height ?? DEFAULT_PLACEMENT.height,
    color: placement.color ?? "#111111",
    text,
  });
  return next;
}

export function addShape(
  design: DesignDoc,
  pageIndex: number,
  shape: ShapeKind,
  placement: NodePlacement = {},
): DesignDoc {
  assertPage(design, pageIndex);
  const next = cloneDesign(design);
  const page = next.pages[pageIndex];
  page.nodes.push({
    id: nextId("shape", pageIndex, page),
    type: "shape",
    shape,
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 200,
    height: placement.height ?? 200,
    color: placement.color ?? "#2563eb",
  });
  return next;
}

/** Set a page's background colour (AC9 "backgrounds"). */
export function setBackground(design: DesignDoc, pageIndex: number, color: string): DesignDoc {
  assertPage(design, pageIndex);
  const next = cloneDesign(design);
  next.pages[pageIndex].background = color;
  return next;
}

/**
 * Add an image pulled from the approved catalog (AC9). The caller supplies the served asset URL and
 * the catalog entry id (provenance) — the studio never fabricates image sources, so only approved,
 * brand-safe assets (Contract 1, enforced server-side in services/visibility.py) reach the design.
 */
export function addCatalogImage(
  design: DesignDoc,
  pageIndex: number,
  image: { src: string; catalogItemId: string },
  placement: NodePlacement = {},
): DesignDoc {
  assertPage(design, pageIndex);
  const next = cloneDesign(design);
  const page = next.pages[pageIndex];
  page.nodes.push({
    id: nextId("image", pageIndex, page),
    type: "image",
    x: placement.x ?? DEFAULT_PLACEMENT.x,
    y: placement.y ?? DEFAULT_PLACEMENT.y,
    width: placement.width ?? 480,
    height: placement.height ?? 480,
    src: image.src,
    catalogItemId: image.catalogItemId,
  });
  return next;
}

/** Append a blank page (pamphlet multi-page, AC9). */
export function addPage(design: DesignDoc): DesignDoc {
  const next = cloneDesign(design);
  next.pages.push(emptyPage());
  return next;
}

function mapNode(
  design: DesignDoc,
  pageIndex: number,
  nodeId: string,
  fn: (node: DesignNode) => DesignNode,
): DesignDoc {
  assertPage(design, pageIndex);
  const next = cloneDesign(design);
  const page = next.pages[pageIndex];
  const idx = page.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    throw new Error(`node ${nodeId} not found on page ${pageIndex}`);
  }
  page.nodes[idx] = fn(page.nodes[idx]);
  return next;
}

/** Move a node (AC9 "move"). */
export function moveNode(
  design: DesignDoc,
  pageIndex: number,
  nodeId: string,
  x: number,
  y: number,
): DesignDoc {
  return mapNode(design, pageIndex, nodeId, (n) => ({ ...n, x, y }));
}

/** Resize a node (AC9 "resize"). */
export function resizeNode(
  design: DesignDoc,
  pageIndex: number,
  nodeId: string,
  width: number,
  height: number,
): DesignDoc {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`node size must be positive, got ${width}x${height}`);
  }
  return mapNode(design, pageIndex, nodeId, (n) => ({ ...n, width, height }));
}

/** Edit a text node's text (AC9 "edit text"). Throws if the target is not a text node. */
export function editText(
  design: DesignDoc,
  pageIndex: number,
  nodeId: string,
  text: string,
): DesignDoc {
  return mapNode(design, pageIndex, nodeId, (n) => {
    if (n.type !== "text") {
      throw new Error(`node ${nodeId} is a ${n.type} node, not editable text`);
    }
    return { ...n, text };
  });
}
