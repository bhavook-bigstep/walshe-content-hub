"use client";

import { useState, type ReactNode } from "react";
import ExportMenu from "./ExportMenu";
import FormatPicker from "./FormatPicker";
import PersonalizePanel from "./PersonalizePanel";
import Toolbar, { type CatalogImageOption } from "./Toolbar";
import type { FormatName } from "../../lib/studio/formats";
import type { DesignDoc } from "../../lib/studio/ops";

type Tool = "elements" | "format" | "personalise" | "export";

interface Props {
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
  onPickFormat: (format: FormatName) => void;
  catalogImages: readonly CatalogImageOption[];
  compositionId: number | null;
}

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: "elements", label: "Add elements", icon: <path d="M12 5v14M5 12h14" /> },
  {
    id: "format",
    label: "Format & size",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
      </>
    ),
  },
  {
    id: "personalise",
    label: "Personalise",
    icon: (
      <>
        <path d="M20 21a8 8 0 10-16 0" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
  { id: "export", label: "Export / download", icon: <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16" /> },
];

/**
 * The studio's floating right rail (AC46/47 UI): a compact vertical icon bar whose creation and
 * output tools each open a popover to its left. The underlying panels are unchanged — this is only
 * the chrome that hosts them.
 */
export default function StudioRightRail({
  design,
  sceneIndex,
  onChange,
  onPickFormat,
  catalogImages,
  compositionId,
}: Props) {
  const [active, setActive] = useState<Tool | null>(null);
  const activeTool = TOOLS.find((t) => t.id === active);

  return (
    <div className="pointer-events-auto absolute right-3 top-24 z-30 flex items-start gap-2">
      {activeTool && (
        <div className="max-h-[calc(100vh-13rem)] w-80 max-w-[calc(100vw-5rem)] overflow-y-auto rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-4 shadow-xl backdrop-blur-md">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-h3 text-walshe-ink">{activeTool.label}</h2>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setActive(null)}
              className="grid h-7 w-7 place-items-center rounded-md text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          {active === "elements" && (
            <Toolbar design={design} sceneIndex={sceneIndex} onChange={onChange} catalogImages={catalogImages} />
          )}
          {active === "format" && <FormatPicker value={design.format} onChange={onPickFormat} />}
          {active === "personalise" && (
            <PersonalizePanel design={design} sceneIndex={sceneIndex} onChange={onChange} />
          )}
          {active === "export" && (
            <ExportMenu design={design} sceneIndex={sceneIndex} compositionId={compositionId} />
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-xl border border-walshe-line/70 bg-chrome-bg/90 p-1.5 shadow-xl backdrop-blur-md">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            title={t.label}
            aria-pressed={active === t.id}
            onClick={() => setActive((cur) => (cur === t.id ? null : t.id))}
            className={`grid h-11 w-11 place-items-center rounded-lg transition-colors ${
              active === t.id ? "bg-walshe-teal text-white" : "text-walshe-ink hover:bg-walshe-ink/10"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {t.icon}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
