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
    "rounded-sm border border-walshe-teal px-3 py-1.5 text-small font-medium text-walshe-teal transition-colors hover:bg-walshe-teal-100 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Export">
      <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("png")}>
        Export PNG
      </button>
      <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("pdf")}>
        Export PDF
      </button>
      <button type="button" className={btn} disabled={busy !== null} onClick={() => void run("html")}>
        Export email HTML
      </button>
      {error && (
        <span role="alert" className="text-small text-walshe-danger">
          {error}
        </span>
      )}
    </div>
  );
}
