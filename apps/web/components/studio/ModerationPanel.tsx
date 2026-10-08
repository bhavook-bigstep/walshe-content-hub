"use client";

import type { ModerationFlag } from "../../lib/studio/moderation";

interface Props {
  flags: ModerationFlag[];
  /** False when no collection is attached (nothing to check the copy against). */
  hasEntries: boolean;
  /** Jump to the flagged element on the canvas. */
  onSelect?: (sceneIndex: number, nodeId: string) => void;
}

const SEVERITY: Record<ModerationFlag["severity"], { label: string; cls: string }> = {
  mismatch: { label: "Mismatch", cls: "bg-walshe-danger/15 text-walshe-danger" },
  unsourced: { label: "Not in collection", cls: "bg-walshe-warn/15 text-walshe-warn" },
};

/**
 * Content Moderation (AI Builder dock tab). Continuously re-checks the current workspace: every piece
 * of factual copy on the canvas is verified against the attached collection entries, and anything
 * that contradicts an entry or isn't grounded in one is listed here. The check itself is the pure
 * `moderateWorkspace` (recomputed by the dock on every edit) — this panel only presents it.
 */
export default function ModerationPanel({ flags, hasEntries, onSelect }: Props) {
  if (!hasEntries) {
    return (
      <div className="px-2 py-8 text-center">
        <p className="text-small font-medium text-walshe-ink">Nothing to check yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] text-walshe-grey">
          Attach a collection to the workspace and the moderator will verify every fact on the canvas
          against its entries.
        </p>
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <div className="flex flex-col items-center px-2 py-8 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-walshe-green/15 text-walshe-green">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <p className="mt-3 text-small font-semibold text-walshe-ink">All copy is grounded</p>
        <p className="mt-1 text-[12px] text-walshe-grey">
          Every fact on the canvas matches the collection entries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-walshe-danger/15 px-1.5 text-[12px] font-bold tabular-nums text-walshe-danger">
          {flags.length}
        </span>
        <p className="text-small font-semibold text-walshe-ink">
          {flags.length === 1 ? "issue to review" : "issues to review"}
        </p>
        <p className="ml-auto text-[11px] text-walshe-grey">Checked against the collection</p>
      </div>

      <ul className="space-y-2">
        {flags.map((f) => {
          const sev = SEVERITY[f.severity];
          const Row = onSelect ? "button" : "div";
          return (
            <li key={f.id}>
              <Row
                {...(onSelect
                  ? {
                      type: "button" as const,
                      onClick: () => onSelect(f.sceneIndex, f.nodeId),
                      title: "Select this element on the canvas",
                    }
                  : {})}
                className={`block w-full rounded-lg border border-walshe-line bg-walshe-base p-3 text-left ${
                  onSelect ? "transition-colors hover:border-walshe-teal/60 hover:bg-walshe-ink/[0.03]" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sev.cls}`}>
                    {sev.label}
                  </span>
                  <span className="text-[11px] text-walshe-grey">Scene {f.sceneIndex + 1}</span>
                </div>
                <p className="mt-1.5 truncate text-small font-medium text-walshe-ink">“{f.text}”</p>
                <p className="mt-0.5 text-[12px] leading-snug text-walshe-grey">{f.detail}</p>
              </Row>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
