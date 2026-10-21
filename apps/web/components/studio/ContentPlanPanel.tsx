"use client";

import { useState } from "react";
import { generateContentPlan } from "../../lib/api";

/**
 * Content Planner (plan → build): turn a vague brief into a concrete, scene-by-scene content plan
 * (markdown), grounded in the open collection's items. The plan is editable, so you can refine the
 * draft, then "Send to Builder" runs it as the AI Builder's brief. Good for planning first; small
 * tweaks after go straight through the Builder's own prompt.
 */
export default function ContentPlanPanel({
  itemIds,
  onUsePlan,
}: {
  itemIds: number[];
  /** Hand the (edited) plan to the AI Builder as its brief and switch to the Builder tab. */
  onUsePlan: (plan: string) => void;
}) {
  const [brief, setBrief] = useState("");
  const [plan, setPlan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const prompt = brief.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateContentPlan({ prompt, item_ids: itemIds });
      setPlan(res.plan);
    } catch {
      setError("Could not generate a plan. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Content planner">
      <p className="text-small text-walshe-grey">
        Describe the idea and the planner drafts a scene-by-scene plan — copy, imagery, animation —
        grounded in your open collection. Edit it, then send it to the Builder to execute.
      </p>
      <label className="block">
        <span className="label">Idea / brief</span>
        <textarea
          className="field-area text-small"
          placeholder="e.g. a cosy autumn weekend in the west of Ireland"
          aria-label="Planner brief"
          value={brief}
          maxLength={2000}
          rows={2}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate();
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => void generate()}
        disabled={busy || brief.trim().length === 0}
        className="btn-primary self-start disabled:opacity-60"
      >
        {busy ? "Planning…" : plan ? "Regenerate plan" : "Generate plan"}
      </button>

      {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}

      {plan && (
        <div className="flex flex-col gap-2">
          <span className="label">Plan draft (editable)</span>
          <textarea
            className="field-area whitespace-pre-wrap font-mono text-[12px] leading-relaxed"
            aria-label="Editable content plan"
            value={plan}
            rows={12}
            onChange={(e) => setPlan(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUsePlan(plan.trim())}
              disabled={plan.trim().length === 0}
              className="btn-primary self-start disabled:opacity-60"
            >
              Send to Builder →
            </button>
            <span className="text-[11px] text-walshe-grey">
              Runs the plan as the Builder brief — refine further in the Builder.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
