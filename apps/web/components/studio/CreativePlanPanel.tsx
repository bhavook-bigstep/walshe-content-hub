"use client";

import { useState } from "react";
import { ApiError, buildCreativePlan, type CreativePlan } from "../../lib/api";

/** AC41/AC42 — generate a grounded Creative Plan from the selected catalog items. The plan's copy is
 *  built only from approved content, and each claim shows the approved source it traces to. */
export default function CreativePlanPanel({ itemIds }: { itemIds: number[] }) {
  const [plan, setPlan] = useState<CreativePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (itemIds.length === 0) {
      setError("Add at least one catalog item first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPlan(await buildCreativePlan(itemIds.slice(0, 6), { format: "social" }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not build a plan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Creative plan">
      <p className="text-small text-walshe-grey">
        Draft a grounded plan — headline, body and sources — from your selected content.
      </p>
      <button type="button" onClick={() => void generate()} disabled={busy} className="btn-primary self-start">
        {busy ? "Planning…" : "Generate creative plan"}
      </button>

      {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}

      {plan && (
        <div data-testid="creative-plan" className="space-y-3 rounded-md border border-walshe-line bg-walshe-stone/40 p-4">
          <span
            data-testid="plan-status"
            className={plan.ready ? "chip-verified" : "chip-draft"}
          >
            {plan.ready ? "Grounded ✓" : "Needs review"}
          </span>
          <div>
            <p className="text-h3 text-[1.0625rem] text-walshe-ink">{plan.ad_copy.headline}</p>
            <p className="mt-1 text-small text-walshe-grey">{plan.ad_copy.body}</p>
            <p className="mt-2 text-small font-semibold text-walshe-mint">{plan.ad_copy.cta}</p>
          </div>
          {plan.issues.length > 0 && (
            <ul className="space-y-1 text-small text-walshe-danger">
              {plan.issues.map((i, k) => (
                <li key={k}>• {i}</li>
              ))}
            </ul>
          )}
          {plan.sources.length > 0 && (
            <div>
              <p className="label">Grounded in</p>
              <ul className="mt-1 space-y-1 text-small text-walshe-grey">
                {plan.sources.filter((s) => s.grounded).map((s, k) => (
                  <li key={k}>
                    ✓ “{s.claim.slice(0, 48)}{s.claim.length > 48 ? "…" : ""}” — {s.evidence_field}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
