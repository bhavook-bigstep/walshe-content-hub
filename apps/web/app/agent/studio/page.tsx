"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas } from "fabric";
import BuilderPanel, { type BuilderCatalogItem } from "../../../components/studio/BuilderPanel";
import ExportMenu from "../../../components/studio/ExportMenu";
import FormatPicker from "../../../components/studio/FormatPicker";
import PersonalizePanel from "../../../components/studio/PersonalizePanel";
import VideoPanel from "../../../components/studio/VideoPanel";
import Toolbar, { type CatalogImageOption } from "../../../components/studio/Toolbar";
import { fetchAssetObjectUrl, listAgentCatalog, type Entry } from "../../../lib/api";
import { getFormatPreset, type FormatName } from "../../../lib/studio/formats";
import { addShape, addText, newDesign, setBackground, type DesignDoc } from "../../../lib/studio/ops";

// Fabric touches `window` at import time, so the canvas must never render on the server.
const StudioCanvas = dynamic(() => import("../../../components/studio/StudioCanvas"), { ssr: false });

// Synthetic placeholder asset (inline SVG) standing in for an approved catalog image.
const SEED_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#93c5fd"/></svg>',
  );
const CATALOG_IMAGES: readonly CatalogImageOption[] = [
  { catalogItemId: "seed-1", label: "Sample", src: SEED_IMAGE },
];

// Map an approved catalog entry to the panel item shape; the first asset (if any) becomes the image.
async function toPanelItem(e: Entry): Promise<BuilderCatalogItem> {
  const item: BuilderCatalogItem = { id: e.id, title: e.title, destination: e.destination, description: e.description };
  const key = e.asset_keys[0];
  if (key) {
    try {
      item.imageSrc = await fetchAssetObjectUrl(key);
    } catch {
      // Image is optional; the item still submits its real id.
    }
  }
  return item;
}

function seeded(format: FormatName): DesignDoc {
  let d = newDesign(format);
  d = setBackground(d, 0, "#fef3c7");
  d = addShape(d, 0, "ellipse", { x: 600, y: 120, width: 240, height: 240, color: "#f97316" });
  d = addText(d, 0, "Discover Ireland", { x: 64, y: 64, width: 480 });
  return d;
}

export default function StudioPage() {
  const [design, setDesign] = useState<DesignDoc>(() => seeded("social"));
  const [pageIndex, setPageIndex] = useState(0);
  const [panelItems, setPanelItems] = useState<BuilderCatalogItem[] | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    listAgentCatalog()
      .then((entries) => Promise.all(entries.map(toPanelItem)))
      .then((items) => {
        items.forEach((i) => i.imageSrc && urls.push(i.imageSrc));
        if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u));
        else setPanelItems(items);
      })
      .catch(() => !cancelled && setPanelItems([]));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);
  const onReady = useCallback((c: Canvas | null) => {
    canvasRef.current = c;
  }, []);

  function pickFormat(format: FormatName) {
    getFormatPreset(format);
    setDesign(seeded(format));
    setPageIndex(0);
  }

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Design Studio</h1>
      <FormatPicker value={design.format} onChange={pickFormat} />
      <Toolbar
        design={design}
        pageIndex={pageIndex}
        onChange={setDesign}
        onPageChange={setPageIndex}
        catalogImages={CATALOG_IMAGES}
      />
      <StudioCanvas design={design} pageIndex={pageIndex} onReady={onReady} />
      {panelItems === null ? (
        <p role="status">Loading catalog…</p>
      ) : panelItems.length === 0 ? (
        <p role="status">No approved catalog items available for the Builder and Video panels.</p>
      ) : (
        <BuilderPanel design={design} pageIndex={pageIndex} items={panelItems} onChange={setDesign} />
      )}
      <PersonalizePanel design={design} pageIndex={pageIndex} onChange={setDesign} />
      {panelItems !== null && panelItems.length > 0 && <VideoPanel items={panelItems} />}
      <ExportMenu design={design} pageIndex={pageIndex} getCanvas={() => canvasRef.current} />
    </main>
  );
}
