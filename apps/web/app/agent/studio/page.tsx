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
import PageHeader from "../../../components/ui/PageHeader";
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
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Design Studio" }]}
        title="Design Studio"
        description="Compose pamphlets, posts and stories on the canvas — manually or with the AI Builder."
      />

      {/* Teal toolbar: format + canvas tools (brief §4). */}
      <div className="mb-4 flex flex-col gap-3 rounded-md bg-walshe-teal p-3">
        <FormatPicker value={design.format} onChange={pickFormat} />
        <Toolbar
          design={design}
          pageIndex={pageIndex}
          onChange={setDesign}
          onPageChange={setPageIndex}
          catalogImages={CATALOG_IMAGES}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Dark-neutral canvas surround; the Fabric canvas itself stays white. */}
        <div className="flex items-start justify-center overflow-auto rounded-md bg-neutral-800 p-6">
          <StudioCanvas design={design} pageIndex={pageIndex} onReady={onReady} />
        </div>

        {/* Right-hand panels. */}
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-3 text-h3 font-bold text-walshe-ink">AI Builder</h2>
            {panelItems === null ? (
              <p role="status" className="text-small text-walshe-grey">Loading catalog…</p>
            ) : panelItems.length === 0 ? (
              <p role="status" className="text-small text-walshe-grey">
                No approved catalog items available for the Builder and Video panels.
              </p>
            ) : (
              <BuilderPanel design={design} pageIndex={pageIndex} items={panelItems} onChange={setDesign} />
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-h3 font-bold text-walshe-ink">Personalize</h2>
            <PersonalizePanel design={design} pageIndex={pageIndex} onChange={setDesign} />
          </section>

          {panelItems !== null && panelItems.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-h3 font-bold text-walshe-ink">Video</h2>
              <VideoPanel items={panelItems} />
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-3 text-h3 font-bold text-walshe-ink">Export</h2>
            <ExportMenu design={design} pageIndex={pageIndex} getCanvas={() => canvasRef.current} />
          </section>
        </div>
      </div>
    </div>
  );
}
