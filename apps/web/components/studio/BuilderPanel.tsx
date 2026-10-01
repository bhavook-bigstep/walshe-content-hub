"use client";

import { useState } from "react";
import { builderDesign, type DesignRequest } from "../../lib/api";
import { addCatalogImage, addText, type DesignDoc } from "../../lib/studio/ops";

/** A selected catalog item the Builder may reference. `imageSrc` is the served asset URL (if any). */
export interface BuilderCatalogItem {
  id: number;
  title: string;
  destination?: string;
  description?: string;
  imageSrc?: string;
}

/** Op shapes returned by POST /builder/design (apps/api/app/ai/builder.py). */
type BuilderOp =
  | { op: "place"; item_id: number }
  | { op: "write-copy"; item_id: number | null; text: string };

const MARGIN = 48;
const ROW_H = 120;
const IMAGE_SIZE = 360;

/** Defensively pull a typed op list out of the opaque response; unknown/malformed entries are dropped. */
export function parseBuilderOps(response: Record<string, unknown>): BuilderOp[] {
  const raw = response.ops;
  if (!Array.isArray(raw)) return [];
  const ops: BuilderOp[] = [];
  for (const e of raw as Record<string, unknown>[]) {
    if (!e || typeof e !== "object") continue;
    const id = e.item_id;
    if (e.op === "place" && typeof id === "number") {
      ops.push({ op: "place", item_id: id });
    } else if (
      e.op === "write-copy" &&
      (id === null || typeof id === "number") &&
      typeof e.text === "string" &&
      e.text.trim()
    ) {
      ops.push({ op: "write-copy", item_id: id, text: e.text });
    }
  }
  return ops;
}

/**
 * Apply Builder ops onto the canvas design using the pure studio ops (source of truth). Deterministic
 * and non-mutating. Copy ops become text nodes stacked down the page; `place` ops add the item's
 * approved catalog image (skipped when the item has no image or is not among the selected items —
 * the studio never fabricates image sources).
 */
export function applyBuilderOps(
  design: DesignDoc,
  pageIndex: number,
  ops: BuilderOp[],
  items: BuilderCatalogItem[],
): DesignDoc {
  const byId = new Map(items.map((i) => [i.id, i]));
  const width = Math.max(design.width - 2 * MARGIN, 1);
  let next = design;
  let y = MARGIN;
  for (const op of ops) {
    if (op.op === "write-copy") {
      if (op.item_id !== null && !byId.has(op.item_id)) continue;
      next = addText(next, pageIndex, op.text, { x: MARGIN, y, width });
      y += ROW_H;
    } else {
      const item = byId.get(op.item_id);
      if (!item?.imageSrc) continue;
      const size = Math.min(IMAGE_SIZE, width);
      next = addCatalogImage(
        next,
        pageIndex,
        { src: item.imageSrc, catalogItemId: String(item.id) },
        { x: MARGIN, y, width: size, height: size },
      );
      y += size + MARGIN / 2;
    }
  }
  return next;
}

export default function BuilderPanel({
  design,
  pageIndex,
  items,
  onChange,
  generate = builderDesign,
}: {
  design: DesignDoc;
  pageIndex: number;
  /** Catalog items selected for this design. */
  items: BuilderCatalogItem[];
  onChange: (next: DesignDoc) => void;
  generate?: (body: DesignRequest) => Promise<Record<string, unknown>>;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canRun = !loading && prompt.trim().length > 0 && items.length > 0;

  async function run() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await generate({
        prompt: prompt.trim(),
        item_ids: items.map((i) => i.id),
      });
      const ops = parseBuilderOps(res);
      const next = applyBuilderOps(design, pageIndex, ops, items);
      if (next === design) {
        setNotice("The Builder returned nothing to place. Try a more specific prompt.");
        return;
      }
      onChange(next);
      setNotice("Design generated. You can now refine it manually.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Builder request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Builder" aria-busy={loading}>
      <textarea
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder="Describe the design you want"
        aria-label="Builder prompt"
        value={prompt}
        maxLength={2000}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {items.length === 0 ? (
        <p className="text-sm text-gray-600">Select at least one catalog item for the Builder to use.</p>
      ) : (
        <p className="text-sm text-gray-600">
          {items.length} catalog item{items.length === 1 ? "" : "s"} selected
        </p>
      )}
      <button
        type="button"
        className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 disabled:opacity-50"
        disabled={!canRun}
        onClick={() => void run()}
      >
        {loading ? "Generating..." : "Generate design"}
      </button>
      {notice && <p role="status" className="text-sm text-gray-700">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
