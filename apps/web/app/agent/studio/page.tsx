"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Canvas } from "fabric";
import BuilderPanel, { type BuilderCatalogItem } from "../../../components/studio/BuilderPanel";
import CreativePlanPanel from "../../../components/studio/CreativePlanPanel";
import ExportMenu from "../../../components/studio/ExportMenu";
import FormatPicker from "../../../components/studio/FormatPicker";
import PersonalizePanel from "../../../components/studio/PersonalizePanel";
import VideoPanel from "../../../components/studio/VideoPanel";
import Toolbar, { type CatalogImageOption } from "../../../components/studio/Toolbar";
import PageHeader from "../../../components/ui/PageHeader";
import {
  createProject,
  fetchAssetObjectUrl,
  getProject,
  listAgentCatalog,
  listDesignTemplates,
  updateProject,
  type Entry,
} from "../../../lib/api";
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
  return (
    <Suspense fallback={<p className="text-small text-walshe-grey">Loading the studio…</p>}>
      <StudioEditor />
    </Suspense>
  );
}

function StudioEditor() {
  const [design, setDesign] = useState<DesignDoc>(() => seeded("social"));
  const [pageIndex, setPageIndex] = useState(0);
  const [panelItems, setPanelItems] = useState<BuilderCatalogItem[] | null>(null);
  const [project, setProject] = useState<{ id: number; name: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const params = useSearchParams();
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

  // Open a saved project (?project=id) or start from a template (?template=id) (AC31).
  useEffect(() => {
    const pid = params.get("project");
    const tid = params.get("template");
    if (pid) {
      getProject(Number(pid))
        .then((p) => {
          setProject({ id: p.id, name: p.name });
          const d = p.design as unknown as Partial<DesignDoc> | undefined;
          if (d && Array.isArray(d.pages) && d.pages.length > 0) setDesign(d as DesignDoc);
        })
        .catch(() => {});
    } else if (tid) {
      listDesignTemplates()
        .then((templates) => {
          const t = templates.find((x) => x.id === tid);
          if (!t) return;
          const fmt = (["social", "story", "pamphlet"].includes(t.format) ? t.format : "social") as FormatName;
          pickFormat(fmt);
          setProject({ id: 0, name: `${t.name} (template)` });
        })
        .catch(() => {});
    }
    // params are read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProject() {
    setSaveMsg(null);
    setSaving(true);
    try {
      // The API stores `design` as a generic JSON object; DesignDoc is our richer view of it.
      const designJson = design as unknown as Record<string, unknown>;
      if (project && project.id > 0) {
        await updateProject(project.id, { design: designJson });
        setSaveMsg("Saved.");
      } else {
        const name = (project?.name || "Untitled project").replace(" (template)", "");
        const created = await createProject({ name, format: design.format, design: designJson });
        setProject({ id: created.id, name: created.name });
        setSaveMsg("Saved to Projects.");
      }
    } catch {
      setSaveMsg("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Design Studio"
        description="Compose pamphlets, posts and stories on the canvas — manually or with the AI Builder."
        action={
          <div className="flex items-center gap-3">
            {saveMsg && <span className="text-small font-medium text-walshe-green">{saveMsg}</span>}
            <button type="button" onClick={saveProject} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : project && project.id > 0 ? "Save project" : "Save to projects"}
            </button>
          </div>
        }
      />

      {project && (
        <p className="-mt-3 mb-5 text-small text-walshe-grey">
          Editing: <span className="font-semibold text-walshe-ink">{project.name}</span>
        </p>
      )}

      {/* Slim top tool bar: format + canvas tools, grouped (Canva-style). */}
      <div className="mb-5 rounded-lg border border-walshe-line bg-walshe-stone/60 p-3 shadow-card sm:px-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="flex items-end pb-2">
            <FormatPicker value={design.format} onChange={pickFormat} />
          </div>
          <span aria-hidden className="hidden h-9 w-px self-end bg-walshe-line sm:block" />
          <Toolbar
            design={design}
            pageIndex={pageIndex}
            onChange={setDesign}
            onPageChange={setPageIndex}
            catalogImages={CATALOG_IMAGES}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Soft neutral workspace with a dotted surface; the artboard stays white. */}
        <div
          className="flex min-h-[460px] items-center justify-center overflow-auto rounded-lg border border-walshe-line bg-walshe-mist p-6 sm:p-10"
          style={{
            backgroundImage: "radial-gradient(rgb(var(--walshe-stone)) 1.1px, transparent 1.1px)",
            backgroundSize: "18px 18px",
          }}
        >
          <StudioCanvas design={design} pageIndex={pageIndex} onReady={onReady} />
        </div>

        {/* Right-hand panel rail. */}
        <div className="flex flex-col gap-5">
          <RailCard eyebrow="AI" title="AI Builder" icon={ICON.sparkle}>
            {panelItems === null ? (
              <p role="status" className="text-small text-walshe-grey">Loading catalog…</p>
            ) : panelItems.length === 0 ? (
              <p role="status" className="text-small text-walshe-grey">
                No approved catalog items available for the Builder and Video panels.
              </p>
            ) : (
              <BuilderPanel design={design} pageIndex={pageIndex} items={panelItems} onChange={setDesign} />
            )}
          </RailCard>

          <RailCard eyebrow="Plan" title="Creative plan" icon={ICON.sparkle}>
            <CreativePlanPanel itemIds={(panelItems ?? []).map((i) => Number(i.id))} />
          </RailCard>

          <RailCard eyebrow="Branding" title="Personalise" icon={ICON.user}>
            <PersonalizePanel design={design} pageIndex={pageIndex} onChange={setDesign} />
          </RailCard>

          {panelItems !== null && panelItems.length > 0 && (
            <RailCard eyebrow="Motion" title="Video" icon={ICON.video}>
              <VideoPanel items={panelItems} />
            </RailCard>
          )}

          <RailCard eyebrow="Download" title="Export" icon={ICON.download}>
            <ExportMenu design={design} pageIndex={pageIndex} getCanvas={() => canvasRef.current} />
          </RailCard>
        </div>
      </div>
    </div>
  );
}

const ICON = {
  sparkle: <path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />,
  user: <path d="M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8" />,
  video: <path d="M4 5h16v14H4zM10 9l5 3-5 3z" />,
  download: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" />,
} as const;

// Right-rail panel card: icon badge + eyebrow + heading, then the panel body.
function RailCard({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 flex-none place-items-center rounded-md bg-walshe-mint text-walshe-teal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {icon}
          </svg>
        </span>
        <div className="min-w-0">
          <p className="eyebrow text-[11px]">{eyebrow}</p>
          <h2 className="text-h3 text-walshe-ink">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
