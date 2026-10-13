"use client";

import { useState } from "react";

/** A selected catalog item the Builder may reference. `imageSrc` is the served asset URL (if any). */
export interface BuilderCatalogItem {
  id: number;
  title: string;
  destination?: string;
  description?: string;
  imageSrc?: string;
}

/**
 * AI Builder: describe a brief and the real agent (POST /ai-agent/studio/agent, run by the page via
 * `onBuild`) composes it on the canvas. The prompt is controllable so the Planner can hand its plan
 * to the Builder; it falls back to local state otherwise.
 */
export default function BuilderPanel({
  items,
  onBuild,
  building = false,
  prompt: controlledPrompt,
  onPromptChange,
}: {
  /** Catalog items available to the design ( grounds the agent + shown as a chip). */
  items: BuilderCatalogItem[];
  /** Run the agent build with this brief (the page owns the loop + progress overlay). */
  onBuild: (prompt: string) => void | Promise<void>;
  /** True while a build is running (disables the button, shows "Building…"). */
  building?: boolean;
  /** Controlled brief — lets the Planner hand its plan to the Builder. Falls back to local state. */
  prompt?: string;
  onPromptChange?: (value: string) => void;
}) {
  const [localPrompt, setLocalPrompt] = useState("");
  const prompt = controlledPrompt ?? localPrompt;
  const setPrompt = onPromptChange ?? setLocalPrompt;
  const canRun = !building && prompt.trim().length > 0;

  return (
    <section className="flex flex-col gap-3" aria-label="Builder">
      <p className="text-small text-walshe-grey">
        Describe what you want and the AI Builder composes it on the canvas — grounded in your open
        collection&apos;s items.
      </p>
      <label className="block">
        <span className="label">Design brief</span>
        <textarea
          className="field-area text-small"
          placeholder="Describe the design you want (or send a plan from the Planner)"
          aria-label="Builder prompt"
          value={prompt}
          maxLength={6000}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </label>
      {items.length === 0 ? (
        <p className="text-small text-walshe-grey">
          No collection open — the Builder will work from your brief. Open a project from a
          collection to ground it in your imagery.
        </p>
      ) : (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-walshe-teal px-3 py-1 text-small font-semibold text-white">
          {items.length} catalog item{items.length === 1 ? "" : "s"} available
        </p>
      )}
      <button
        type="button"
        className="btn-primary self-start disabled:opacity-60"
        disabled={!canRun}
        onClick={() => void onBuild(prompt.trim())}
      >
        {building ? "Building…" : "Generate design"}
      </button>
    </section>
  );
}
