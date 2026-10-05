"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { Canvas } from "fabric";
import type { StudioControls } from "../../../components/studio/StudioCanvas";
import type { BuilderCatalogItem } from "../../../components/studio/BuilderPanel";
import SceneControls from "../../../components/studio/SceneControls";
import StudioBottomDock from "../../../components/studio/StudioBottomDock";
import StudioRightRail from "../../../components/studio/StudioRightRail";
import type { CatalogImageOption } from "../../../components/studio/Toolbar";
import {
  createProject,
  fetchAssetObjectUrl,
  getProject,
  listAgentCatalog,
  listDesignTemplates,
  renderVideo,
  updateProject,
  type Entry,
} from "../../../lib/api";
import { designToVideoRequest } from "../../../lib/studio/storyboard-video";
import { getFormatPreset, type FormatName } from "../../../lib/studio/formats";
import {
  addShape,
  addText,
  migrateDesign,
  moveNode,
  newDesign,
  resizeNode,
  setBackground,
  type DesignDoc,
} from "../../../lib/studio/ops";

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
  const [sceneIndex, setSceneIndex] = useState(0);
  const [panelItems, setPanelItems] = useState<BuilderCatalogItem[] | null>(null);
  const [project, setProject] = useState<{ id: number; name: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [videoMsg, setVideoMsg] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [storyboardOpen, setStoryboardOpen] = useState(false);
  const params = useSearchParams();
  const canvasRef = useRef<Canvas | null>(null);
  const controlsRef = useRef<StudioControls | null>(null);
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
    setSceneIndex(0);
  }

  // Open a saved project (?project=id) or start from a template (?template=id) (AC31).
  useEffect(() => {
    const pid = params.get("project");
    const tid = params.get("template");
    if (pid) {
      getProject(Number(pid))
        .then((p) => {
          setProject({ id: p.id, name: p.name });
          // Migrate the stored design into the canonical scenes[] shape (handles legacy pages[]).
          const migrated = migrateDesign(p.design);
          if (migrated) {
            setDesign(migrated);
            setSceneIndex(0);
          }
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

  // AC47 — stitch the ordered storyboard scenes (durations + transitions, captions, approved
  // catalog images) into an MP4 via the server render service and download it.
  async function generateVideo() {
    setVideoMsg(null);
    setRendering(true);
    try {
      const items = (panelItems ?? []).map((i) => ({
        id: Number(i.id),
        title: i.title,
        description: i.description,
      }));
      const body = designToVideoRequest(design, items, true);
      const blob = await renderVideo(body);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `walsh-${design.format}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setVideoMsg("Video ready.");
    } catch {
      setVideoMsg("Video rendering unavailable.");
    } finally {
      setRendering(false);
    }
  }

  function onNodeChange(
    scene: number,
    nodeId: string,
    box: { x: number; y: number; width: number; height: number },
  ) {
    setDesign((d) => {
      try {
        const moved = moveNode(d, scene, nodeId, box.x, box.y);
        return box.width > 0 && box.height > 0
          ? resizeNode(moved, scene, nodeId, box.width, box.height)
          : moved;
      } catch {
        return d; // ignore a drag the model can't apply (e.g. a removed node)
      }
    });
  }

  const zoomBtn =
    "grid h-8 w-8 place-items-center rounded-sm text-walshe-ink transition-colors hover:bg-walshe-ink/10";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* The dot-matrix workspace spans the whole studio, edge to edge. */}
      <div className="absolute inset-0">
        <StudioCanvas
          design={design}
          activeScene={sceneIndex}
          onReady={onReady}
          onNodeChange={onNodeChange}
          onSelectScene={setSceneIndex}
          onControls={(c) => (controlsRef.current = c)}
        />
      </div>

      {/* Floating sections over the workspace: clicks pass through to the canvas except on panels. */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* Slim top bar: title · Storyboard drawer toggle · Generate video · Save. */}
        <div className="pointer-events-auto absolute left-3 right-3 top-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-walshe-line/70 bg-chrome-bg/85 px-3 py-2 shadow-xl backdrop-blur-md lg:right-20">
          <h1 className="text-h3 text-[1.0625rem] font-bold text-walshe-ink">Design Studio</h1>
          {project && (
            <span className="hidden text-small text-walshe-grey sm:inline">
              · Editing <span className="font-semibold text-walshe-ink">{project.name}</span>
            </span>
          )}
          <span aria-hidden className="hidden h-7 w-px bg-walshe-line sm:block" />
          <button
            type="button"
            onClick={() => setStoryboardOpen((o) => !o)}
            aria-expanded={storyboardOpen}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-small font-semibold transition-colors ${
              storyboardOpen
                ? "border-walshe-teal bg-walshe-mint text-walshe-teal"
                : "border-walshe-line bg-walshe-stone/60 text-walshe-ink hover:bg-walshe-ink/10"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16" />
            </svg>
            Storyboard
            <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-walshe-teal px-1 text-[11px] font-bold text-white">
              {design.scenes.length}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${storyboardOpen ? "rotate-180" : ""}`} aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <div className="ml-auto flex items-center gap-2">
            {videoMsg && <span className="hidden text-small font-medium text-walshe-grey sm:inline">{videoMsg}</span>}
            <button
              type="button"
              onClick={() => void generateVideo()}
              disabled={rendering}
              className="btn-secondary"
            >
              {rendering ? "Rendering…" : "Generate video"}
            </button>
            {saveMsg && <span className="hidden text-small font-medium text-walshe-green sm:inline">{saveMsg}</span>}
            <button type="button" onClick={saveProject} disabled={saving} className="btn-primary">
              {saving ? "Saving…" : project && project.id > 0 ? "Save project" : "Save to projects"}
            </button>
          </div>
        </div>

        {/* Storyboard top drawer (scenes) — slides down from the top bar. */}
        <div
          className={`pointer-events-auto absolute left-3 right-3 top-[4.5rem] origin-top transition-all duration-200 lg:right-20 ${
            storyboardOpen ? "opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
          }`}
          aria-hidden={!storyboardOpen}
        >
          <div className="max-h-[48vh] overflow-y-auto rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-4 shadow-xl backdrop-blur-md">
            <SceneControls
              design={design}
              activeScene={sceneIndex}
              onChange={setDesign}
              onSelectScene={setSceneIndex}
            />
          </div>
        </div>

        {/* Right icon rail: creation tools + export. */}
        <StudioRightRail
          design={design}
          sceneIndex={sceneIndex}
          onChange={setDesign}
          onPickFormat={pickFormat}
          catalogImages={CATALOG_IMAGES}
        />

        {/* Zoom / fit — at the bottom, beside the right rail. */}
        <div className="pointer-events-auto absolute bottom-4 right-3 flex items-center rounded-lg border border-walshe-line/70 bg-chrome-bg/90 px-0.5 shadow-xl backdrop-blur-md">
          <button type="button" aria-label="Zoom out" className={zoomBtn} onClick={() => controlsRef.current?.zoomOut()}>−</button>
          <button type="button" className="px-2 text-small font-medium text-walshe-ink hover:text-walshe-mint" onClick={() => controlsRef.current?.fit()}>Fit</button>
          <button type="button" aria-label="Zoom in" className={zoomBtn} onClick={() => controlsRef.current?.zoomIn()}>+</button>
        </div>

        {/* Bottom AI dock: AI Builder / Planner tabs. */}
        <StudioBottomDock
          design={design}
          sceneIndex={sceneIndex}
          onChange={setDesign}
          items={panelItems}
        />
      </div>
    </div>
  );
}
