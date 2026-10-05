"use client";

import Dialog from "../ui/Dialog";
import CatalogThumb from "./CatalogThumb";
import type { Entry } from "../../lib/api";

// AC61 — a read-only "window box" for an entry: its items (text / image / video), shown when the
// entry is clicked in the Catalog or inside a Collection.
export default function EntryDetailModal({
  entry,
  onClose,
}: {
  entry: Entry | null;
  onClose: () => void;
}) {
  const items = entry?.items ?? [];
  return (
    <Dialog title={entry?.title ?? "Entry"} open={entry !== null} onClose={onClose}>
      {entry && (
        <div className="space-y-4">
          <p className="text-small capitalize text-walshe-grey">
            {entry.type} · {[entry.city, entry.state, entry.country].filter(Boolean).join(", ") || entry.destination}
          </p>
          {entry.description && <p className="text-body text-walshe-ink">{entry.description}</p>}

          {items.length === 0 ? (
            <p className="text-small text-walshe-grey">This entry has no items yet.</p>
          ) : (
            <ul className="space-y-3" aria-label="Entry items">
              {items.map((it) => (
                <li key={it.id} className="rounded-lg border border-walshe-line p-3">
                  <span className="rounded-pill bg-walshe-ink/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-walshe-grey">
                    {it.kind}
                  </span>
                  {it.title && <p className="mt-1 text-small font-semibold text-walshe-ink">{it.title}</p>}
                  {it.kind === "text" ? (
                    <p className="mt-1 whitespace-pre-wrap text-body text-walshe-ink">{it.text}</p>
                  ) : it.kind === "image" ? (
                    <CatalogThumb imageKey={it.object_key} alt={it.title || it.alt || "image"} className="mt-2 h-40 w-full rounded-sm" />
                  ) : (
                    <p className="mt-1 text-small text-walshe-grey">Video · {it.content_type}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
