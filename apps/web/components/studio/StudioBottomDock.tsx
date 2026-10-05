"use client";

import { useState } from "react";
import BuilderPanel, { type BuilderCatalogItem } from "./BuilderPanel";
import CreativePlanPanel from "./CreativePlanPanel";
import type { DesignDoc } from "../../lib/studio/ops";

type Tab = "builder" | "planner";

interface Props {
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
  items: BuilderCatalogItem[] | null;
}

/**
 * The studio's AI dock (AC46/47 UI): a bottom button that slides up a drawer with two tabs —
 * the grounded AI Builder and the Creative Planner. The panels themselves are unchanged.
 */
export default function StudioBottomDock({ design, sceneIndex, onChange, items }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("builder");

  const tabBtn = (id: Tab, label: string) => (
    <button
      type="button"
      aria-pressed={tab === id}
      onClick={() => setTab(id)}
      className={`rounded-lg px-4 py-1.5 text-small font-semibold transition-colors ${
        tab === id ? "bg-walshe-teal text-white" : "text-walshe-grey hover:bg-walshe-ink/10 hover:text-walshe-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the AI studio"
          className="pointer-events-auto absolute bottom-4 left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-walshe-line/70 bg-chrome-bg/90 px-5 py-2.5 text-small font-semibold text-walshe-ink shadow-xl backdrop-blur-md transition-colors hover:bg-walshe-ink/5"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-walshe-teal" aria-hidden>
            <path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
          </svg>
          AI Studio
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center">
        <div
          className={`flex h-[46vh] w-full max-w-3xl flex-col rounded-t-2xl border border-b-0 border-walshe-line/70 bg-chrome-bg/95 shadow-2xl backdrop-blur-md transition-transform duration-300 ${
            open ? "translate-y-0 pointer-events-auto" : "translate-y-full pointer-events-none"
          }`}
          role="dialog"
          aria-label="AI studio"
          aria-hidden={!open}
        >
          <div className="flex flex-none items-center gap-2 border-b border-walshe-line px-4 py-2.5">
            {tabBtn("builder", "AI Builder")}
            {tabBtn("planner", "Planner")}
            <button
              type="button"
              aria-label="Close the AI studio"
              onClick={() => setOpen(false)}
              className="ml-auto grid h-8 w-8 place-items-center rounded-md text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "builder" ? (
              items === null ? (
                <p role="status" className="text-small text-walshe-grey">Loading catalog…</p>
              ) : items.length === 0 ? (
                <p role="status" className="text-small text-walshe-grey">
                  No approved catalog items available for the AI Builder.
                </p>
              ) : (
                <BuilderPanel design={design} sceneIndex={sceneIndex} items={items} onChange={onChange} />
              )
            ) : (
              <CreativePlanPanel itemIds={(items ?? []).map((i) => Number(i.id))} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
