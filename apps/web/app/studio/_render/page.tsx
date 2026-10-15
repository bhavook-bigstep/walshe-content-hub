"use client";
// Headless-only render page. Loaded by lib/studio/render-browser.ts in server-side Chromium (NOT a
// user-facing screen). It installs `window.__studioRender(job)`, which rasterises scene stills via
// the SAME frames.ts renderer the editor and exporter use. The animation clock is SEEKED (each
// still is posed at an explicit atMs) — nothing free-runs, so output is deterministic.
//
// NOTE: Next.js treats `_`-prefixed folders as private; this page is served at /studio/%5Frender.
import { useEffect } from "react";
import { migrateDesign } from "../../../lib/studio/ops";
import { renderSceneStill } from "../../../lib/studio/frames";

export interface RenderJob {
  design: unknown;
  sceneIndex: number;
  times: number[];
}
export interface RenderJobResult {
  pngs: string[];
  width: number;
  height: number;
  broken_images: string[];
}

declare global {
  interface Window {
    __studioRender?: (job: RenderJob) => Promise<RenderJobResult>;
    __studioRenderReady?: boolean;
  }
}

/** Readiness gate: document.fonts.ready + an explicit load of every font family the scene uses. */
async function settleFonts(families: string[]): Promise<void> {
  await Promise.all(families.map((f) => document.fonts.load(`16px ${f}`).catch(() => [])));
  await document.fonts.ready;
}

async function run(job: RenderJob): Promise<RenderJobResult> {
  const design = migrateDesign(job.design);
  if (!design) throw new Error("bad_workspace");
  const scene = design.scenes[Math.max(0, Math.min(job.sceneIndex, design.scenes.length - 1))];
  const families = [...new Set(scene.nodes.map((n) => n.fontFamily).filter((f): f is string => !!f))];
  await settleFonts(families);
  const pngs: string[] = [];
  const broken = new Set<string>();
  let width = design.width;
  let height = design.height;
  for (const t of job.times) {
    // Image decode/settle happens inside nodeToObject (awaits each image load before returning).
    const still = await renderSceneStill(scene, design.width, design.height, t);
    pngs.push(still.png);
    width = still.width;
    height = still.height;
    still.brokenImageIds.forEach((id) => broken.add(id));
  }
  return { pngs, width, height, broken_images: [...broken] };
}

export default function RenderPage() {
  useEffect(() => {
    window.__studioRender = run;
    window.__studioRenderReady = true;
    return () => {
      delete window.__studioRender;
      window.__studioRenderReady = false;
    };
  }, []);
  return <main data-render-page aria-hidden="true" />;
}
