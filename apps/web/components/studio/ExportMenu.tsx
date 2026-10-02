"use client";

import { useState } from "react";
import type { Canvas } from "fabric";
import { renderEmailHtml, renderPdf } from "../../lib/api";
import { filenameFor, type ExportKind } from "../../lib/studio/export";
import type { DesignDoc } from "../../lib/studio/ops";

function download(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  download(url, filename);
  URL.revokeObjectURL(url);
}

export default function ExportMenu({
  design,
  pageIndex,
  getCanvas,
}: {
  design: DesignDoc;
  pageIndex: number;
  getCanvas: () => Canvas | null;
}) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: ExportKind) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "png") {
        const canvas = getCanvas();
        if (!canvas) throw new Error("Canvas is not ready.");
        const page = design.pages.length > 1 ? pageIndex + 1 : undefined;
        download(canvas.toDataURL({ format: "png", multiplier: 1 }), filenameFor(design.format, "png", page));
      } else if (kind === "pdf") {
        downloadBlob(await renderPdf({ ...design }), filenameFor(design.format, "pdf"));
      } else {
        const html = await renderEmailHtml({ ...design });
        downloadBlob(new Blob([html], { type: "text/html" }), filenameFor(design.format, "html"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "inline-flex w-full items-center justify-between gap-2 rounded-sm border border-walshe-line bg-walshe-stone/60 px-4 py-3 text-small font-semibold text-walshe-ink transition-colors hover:border-walshe-ink/30 hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-50";
  const chevron = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-walshe-grey">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" />
    </svg>
  );
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Export">
      <p className="text-small text-walshe-grey">Download the current design in the format you need.</p>
      <div className="flex flex-col gap-2">
        <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("png")}>
          <span>{busy === "png" ? "Exporting…" : "Export PNG"}</span>
          {chevron}
        </button>
        <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("pdf")}>
          <span>{busy === "pdf" ? "Exporting…" : "Export PDF"}</span>
          {chevron}
        </button>
        <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("html")}>
          <span>{busy === "html" ? "Exporting…" : "Export email HTML"}</span>
          {chevron}
        </button>
      </div>
      {error && (
        <span role="alert" className="text-small text-walshe-danger">
          {error}
        </span>
      )}
    </div>
  );
}
