"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { renderEmailHtml, renderPdf } from "../../lib/api";
import { filenameFor } from "../../lib/studio/export";
import {
  addShape,
  addText,
  scenesAsPages,
  setBackground,
  type DesignDoc,
  type LayerMove,
} from "../../lib/studio/ops";
import { inlineDesignImages } from "../../lib/studio/inline-images";
import { prepareForExport } from "../../lib/studio/export-prep";
import { rasterizeSvgSources } from "../../lib/studio/rasterize-svg";
import { resolveSprites } from "../../lib/studio/graphics";
import { renderDesignToPng } from "../../lib/studio/render";
import { FORMAT_NAMES, FORMAT_PRESETS, type FormatName } from "../../lib/studio/formats";
import Spinner from "../ui/Spinner";

// A desktop-style application menu bar for the Design Studio: a row of pull-down menus
// (File · Edit · Insert · Size · View) pinned to the top, the editable document name in the
// middle, and the autosave status on the right. It consolidates what used to be scattered across
// floating controls — export, screen size, insert tools, element actions, zoom — into the one
// always-showing bar people expect at the top of an editor.

interface Props {
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
  /** Editable project (workspace) name. */
  name: string;
  onNameChange: (value: string) => void;
  onNameCommit: () => void;
  saveMsg: string | null;
  /** Screen size / format. */
  onPickFormat: (format: FormatName) => void;
  /** Edit menu — operate on the selected element (disabled when nothing is selected). */
  hasSelection: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (move: LayerMove) => void;
  /** Insert menu — open the add-media (upload / AI) dialog. */
  onAddMedia: () => void;
  /** View menu — canvas zoom + panel toggles. */
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  mediaOpen: boolean;
  onToggleMedia: () => void;
  /** File menu — export the current design as a video. */
  onGenerateVideo: () => void;
  rendering: boolean;
  /** Last video-export result message (e.g. "Video ready."). */
  videoMsg?: string | null;
}

// ── Small presentational primitives for the menus ──────────────────────────────────────────────

const ITEM =
  "flex w-full items-center gap-2.5 whitespace-nowrap px-3 py-1.5 text-left text-small text-walshe-ink transition-colors hover:bg-walshe-ink/5 disabled:cursor-not-allowed disabled:text-walshe-grey/50 disabled:hover:bg-transparent";

function MenuItem({
  label,
  onClick,
  disabled,
  icon,
  hint,
  checked,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  hint?: string;
  checked?: boolean;
}) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={ITEM}>
      {icon !== undefined ? (
        <span className="grid h-4 w-4 flex-none place-items-center text-walshe-grey">{icon}</span>
      ) : checked !== undefined ? (
        <span className="grid h-4 w-4 flex-none place-items-center text-walshe-teal">
          {checked ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12l5 5L20 6" />
            </svg>
          ) : null}
        </span>
      ) : null}
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[11px] text-walshe-grey">{hint}</span>}
    </button>
  );
}

function MenuSep() {
  return <div role="separator" className="my-1 border-t border-walshe-line/70" />;
}

// ── The menu bar ───────────────────────────────────────────────────────────────────────────────

export default function StudioMenuBar(props: Props) {
  const {
    design,
    sceneIndex,
    onChange,
    name,
    onNameChange,
    onNameCommit,
    saveMsg,
    onPickFormat,
    hasSelection,
    onDuplicate,
    onDelete,
    onLayer,
    onAddMedia,
    onZoomIn,
    onZoomOut,
    onFit,
    mediaOpen,
    onToggleMedia,
    onGenerateVideo,
    rendering,
    videoMsg,
  } = props;

  // Exactly one pull-down is open at a time (classic menu-bar behaviour: click to open, then hover
  // the siblings to switch). `null` = all closed.
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  // Run an export and close the menu. The design renders independently of the on-screen pan/zoom.
  async function runExport(kind: "png" | "pdf" | "html") {
    setExporting(kind);
    try {
      if (kind === "png") {
        const page = design.scenes.length > 1 ? sceneIndex + 1 : undefined;
        const href = await renderDesignToPng(design, sceneIndex);
        triggerDownload(href, filenameFor(design.format, "png", page));
      } else if (kind === "pdf") {
        // Normalise for a still export (drop placeholders, sprites → frame 0), rasterise inline SVGs
        // to PNG + inline photos to data: URLs, so the server-side PDF embeds real bitmaps (never a
        // neutral box for a sprite/placeholder/sticker).
        const prepped = await rasterizeSvgSources(prepareForExport(resolveSprites(design)));
        const blob = await renderPdf(scenesAsPages(await inlineDesignImages(prepped)));
        triggerBlob(blob, filenameFor(design.format, "pdf"));
      } else {
        // Email HTML emits only text nodes, so image prep isn't needed here.
        const html = await renderEmailHtml(scenesAsPages(design));
        triggerBlob(new Blob([html], { type: "text/html" }), filenameFor(design.format, "html"));
      }
    } catch {
      /* a transient export failure surfaces nothing destructive; the user can retry */
    } finally {
      setExporting(null);
    }
  }

  // Each top-level label: click toggles; hovering while another menu is open switches to this one.
  function Menu({ id, label, children }: { id: string; label: string; children: ReactNode }) {
    const isOpen = openId === id;
    return (
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setOpenId((cur) => (cur === id ? null : id))}
          onMouseEnter={() => setOpenId((cur) => (cur !== null ? id : cur))}
          className={`rounded-md px-2.5 py-1 text-small font-medium transition-colors ${
            isOpen ? "bg-walshe-ink/10 text-walshe-ink" : "text-walshe-ink/90 hover:bg-walshe-ink/5"
          }`}
        >
          {label}
        </button>
        {isOpen && (
          <div
            role="menu"
            aria-label={label}
            onClick={() => setOpenId(null)}
            className="absolute left-0 top-9 z-50 min-w-[13rem] overflow-hidden rounded-lg border border-walshe-line bg-walshe-base py-1 shadow-lift"
          >
            {children}
          </div>
        )}
      </div>
    );
  }

  const presets: { label: string; size: number; weight: "bold" | "normal" }[] = [
    { label: "Heading", size: 88, weight: "bold" },
    { label: "Subheading", size: 48, weight: "bold" },
    { label: "Body text", size: 30, weight: "normal" },
  ];

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto absolute inset-x-0 top-0 z-40 flex h-11 items-center gap-1 border-b border-walshe-line/70 bg-chrome-bg/95 px-2 shadow-sm backdrop-blur-md"
    >
      {/* Left: the pull-down menus. */}
      <nav className="flex flex-none items-center gap-0.5" aria-label="Studio menu">
        <Menu id="file" label="File">
          <MenuItem
            label="Rename…"
            onClick={() => {
              const el = rootRef.current?.querySelector<HTMLInputElement>('input[aria-label="Project name"]');
              el?.focus();
              el?.select();
            }}
          />
          <MenuSep />
          <MenuItem label={exporting === "png" ? "Exporting…" : "Export as PNG"} disabled={exporting !== null} onClick={() => void runExport("png")} />
          <MenuItem label={exporting === "pdf" ? "Exporting…" : "Export as PDF"} disabled={exporting !== null} onClick={() => void runExport("pdf")} />
          <MenuItem label={exporting === "html" ? "Exporting…" : "Export as email HTML"} disabled={exporting !== null} onClick={() => void runExport("html")} />
          <MenuSep />
          <MenuItem label={rendering ? "Rendering video…" : "Export as video (MP4)"} disabled={rendering} onClick={onGenerateVideo} />
        </Menu>

        <Menu id="edit" label="Edit">
          <MenuItem label="Duplicate element" disabled={!hasSelection} onClick={onDuplicate} />
          <MenuItem label="Delete element" disabled={!hasSelection} onClick={onDelete} />
          <MenuSep />
          <MenuItem label="Bring to front" disabled={!hasSelection} onClick={() => onLayer("front")} />
          <MenuItem label="Bring forward" disabled={!hasSelection} onClick={() => onLayer("forward")} />
          <MenuItem label="Send backward" disabled={!hasSelection} onClick={() => onLayer("backward")} />
          <MenuItem label="Send to back" disabled={!hasSelection} onClick={() => onLayer("back")} />
        </Menu>

        <Menu id="insert" label="Insert">
          {presets.map((p) => (
            <MenuItem
              key={p.label}
              label={p.label}
              onClick={() => onChange(addText(design, sceneIndex, p.label, { fontSize: p.size, fontWeight: p.weight, width: 640 }))}
            />
          ))}
          <MenuSep />
          <MenuItem label="Rectangle" onClick={() => onChange(addShape(design, sceneIndex, "rect"))} />
          <MenuItem label="Ellipse" onClick={() => onChange(addShape(design, sceneIndex, "ellipse"))} />
          <MenuItem label="Line" onClick={() => onChange(addShape(design, sceneIndex, "line"))} />
          <MenuSep />
          <MenuItem label="Image or media…" onClick={onAddMedia} />
          <MenuSep />
          <MenuItem label="White background" onClick={() => onChange(setBackground(design, sceneIndex, "#ffffff"))} />
          <MenuItem label="Clear background" onClick={() => onChange(setBackground(design, sceneIndex, ""))} />
        </Menu>

        <Menu id="size" label="Size">
          {FORMAT_NAMES.map((n) => (
            <MenuItem
              key={n}
              label={`${FORMAT_PRESETS[n].label} · ${FORMAT_PRESETS[n].width}×${FORMAT_PRESETS[n].height}`}
              checked={design.format === n}
              onClick={() => onPickFormat(n)}
            />
          ))}
        </Menu>

        <Menu id="view" label="View">
          <MenuItem label="Zoom in" onClick={onZoomIn} />
          <MenuItem label="Zoom out" onClick={onZoomOut} />
          <MenuItem label="Fit to screen" onClick={onFit} />
          <MenuSep />
          <MenuItem label="Media library" checked={mediaOpen} onClick={onToggleMedia} />
        </Menu>
      </nav>

      {/* Middle: the document name (editable, like a window title). */}
      <input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onBlur={onNameCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label="Project name"
        placeholder="Untitled project"
        className="mx-auto w-full min-w-0 max-w-[22rem] rounded-md border border-transparent bg-transparent px-2 py-1 text-center text-small font-semibold text-walshe-ink hover:border-walshe-line focus:border-walshe-mint focus:bg-walshe-base focus:text-left focus:outline-none"
      />

      {/* Right: processing indicator (export / video) + autosave status. Always visible, so the
          animation shows even after the menu that started the export has closed. */}
      <div className="ml-auto flex flex-none items-center gap-2 pr-1">
        {exporting || rendering ? (
          <span role="status" className="inline-flex items-center gap-1.5 rounded-md bg-walshe-teal/10 px-2 py-1 text-[12px] font-medium text-walshe-teal">
            <Spinner />
            {rendering ? "Rendering video…" : `Exporting ${exporting!.toUpperCase()}…`}
          </span>
        ) : videoMsg ? (
          <span className="hidden text-[12px] font-medium text-walshe-grey sm:inline">{videoMsg}</span>
        ) : (
          saveMsg && <span className="hidden text-[12px] font-medium text-walshe-grey sm:inline">{saveMsg}</span>
        )}
      </div>
    </div>
  );
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}
