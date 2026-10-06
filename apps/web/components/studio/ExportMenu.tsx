"use client";

import { useState } from "react";
import AiCaptionControls from "../ai/AiCaptionControls";
import { publishToInstagram, renderEmailHtml, renderPdf } from "../../lib/api";
import { filenameFor, type ExportKind } from "../../lib/studio/export";
import { buildPublishForm } from "../../lib/studio/instagram";
import { scenesAsPages, type DesignDoc } from "../../lib/studio/ops";
import { renderDesignToJpegBlob, renderDesignToPng } from "../../lib/studio/render";

const CAPTION_MAX = 2200;

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
  sceneIndex,
  compositionId,
}: {
  design: DesignDoc;
  sceneIndex: number;
  compositionId: number | null;
}) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ permalink: string | null; status: string } | null>(
    null,
  );

  async function run(kind: ExportKind) {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "png") {
        const page = design.scenes.length > 1 ? sceneIndex + 1 : undefined;
        download(await renderDesignToPng(design, sceneIndex), filenameFor(design.format, "png", page));
      } else if (kind === "pdf") {
        downloadBlob(await renderPdf(scenesAsPages(design)), filenameFor(design.format, "pdf"));
      } else {
        const html = await renderEmailHtml(scenesAsPages(design));
        downloadBlob(new Blob([html], { type: "text/html" }), filenameFor(design.format, "html"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (compositionId == null) return;
    setPublishing(true);
    setPublishError(null);
    setPublished(null);
    try {
      // Instagram rejects PNG — export this scene as JPEG (spec gap #1).
      const jpeg = await renderDesignToJpegBlob(design, sceneIndex);
      const result = await publishToInstagram(buildPublishForm({ compositionId, caption, jpeg }));
      setPublished({ permalink: result.permalink, status: result.status });
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Publishing failed.");
    } finally {
      setPublishing(false);
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

      {/* Publish to Instagram (exports a JPEG of this scene, then posts it). */}
      <div className="mt-1 flex flex-col gap-2 border-t border-walshe-line/70 pt-3">
        <p className="text-small font-semibold text-walshe-ink">Publish to Instagram</p>
        {compositionId == null ? (
          <p className="text-small text-walshe-grey">Save your project first to publish it.</p>
        ) : (
          <>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
              placeholder="Write a caption (hashtags welcome)…"
              rows={3}
              className="w-full resize-y rounded-sm border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small text-walshe-ink placeholder:text-walshe-grey focus:border-walshe-ink/40 focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-small text-walshe-grey">
                {caption.length}/{CAPTION_MAX}
              </span>
            </div>
            <AiCaptionControls
              compositionId={compositionId}
              caption={caption}
              onCaptionChange={(next) => setCaption(next.slice(0, CAPTION_MAX))}
            />
            <button type="button" className={btn} disabled={publishing} onClick={() => void publish()}>
              <span>{publishing ? "Publishing…" : "Publish to Instagram"}</span>
              {chevron}
            </button>
          </>
        )}
        {published && (
          <span role="status" className="text-small text-walshe-ink">
            {published.permalink ? (
              <>
                Published —{" "}
                <a href={published.permalink} target="_blank" rel="noreferrer" className="font-semibold text-walshe-teal underline">
                  view on Instagram
                </a>
              </>
            ) : (
              <>Published ({published.status}).</>
            )}
          </span>
        )}
        {publishError && (
          <span role="alert" className="text-small text-walshe-danger">
            {publishError}
          </span>
        )}
      </div>
    </div>
  );
}
