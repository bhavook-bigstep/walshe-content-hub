"use client";

import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import CatalogThumb from "./CatalogThumb";
import { getContentTemplates, type ContentTemplates, type Entry } from "../../lib/api";
import { formatAttributeValue } from "../../lib/entry-attributes";

const STATUS_LABELS: Record<string, string> = {
  approved: "Available",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  draft: "Draft",
  in_review: "In review",
  withdrawn: "Withdrawn",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Templates rarely change; cache once per session so every modal open is instant.
let templatesCache: ContentTemplates | null = null;

// AC61 — a read-only "window box" showing ALL info about an entry: its structured details,
// validity, provenance, highlights/sections, and its items (text / image / video).
export default function EntryDetailModal({
  entry,
  onClose,
}: {
  entry: Entry | null;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<ContentTemplates | null>(templatesCache);
  useEffect(() => {
    if (templatesCache || entry === null) return;
    getContentTemplates()
      .then((t) => { templatesCache = t; setTemplates(t); })
      .catch(() => {});
  }, [entry]);

  if (entry === null) return <Dialog title="Entry" open={false} onClose={onClose}>{null}</Dialog>;

  const location = [entry.city, entry.state, entry.country].filter(Boolean).join(", ") || entry.destination;
  const attrs = (entry.attributes ?? {}) as Record<string, unknown>;
  const fields = (templates?.templates?.[entry.type] ?? []).filter((f) => {
    const v = attrs[f.key];
    return v !== null && v !== undefined && String(v) !== "";
  });
  const expired = entry.display_status === "expired";
  const items = entry.items ?? [];

  // Build the full detail grid (structured fields + season + validity).
  const rows: Array<[string, string]> = [
    ...fields.map((f): [string, string] => [f.label, formatAttributeValue(attrs[f.key])]),
  ];
  if (entry.season) rows.push(["Season", entry.season.replace("_", "-")]);
  if (entry.valid_from) rows.push(["Valid from", fmtDate(entry.valid_from)]);
  rows.push(["Expires", entry.expires_at ? fmtDate(entry.expires_at) : "Never"]);
  if ((entry.market_tags ?? []).length) rows.push(["Markets", entry.market_tags.join(", ")]);

  return (
    <Dialog title={entry.title} open onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow text-[11px] capitalize">{entry.type} · {location}</span>
          <span
            className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
              expired ? "bg-walshe-danger/15 text-walshe-danger"
                : entry.display_status === "expiring_soon" ? "bg-walshe-warn/15 text-walshe-warn"
                  : "bg-walshe-stone text-walshe-grey"
            }`}
          >
            {STATUS_LABELS[entry.display_status] ?? entry.display_status}
          </span>
        </div>

        {entry.description && <p className="text-body text-walshe-ink">{entry.description}</p>}

        {rows.length > 0 && (
          <div>
            <h3 className="mb-2 text-small font-semibold text-walshe-ink">Details</h3>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 border-b border-walshe-line/60 py-1.5">
                  <dt className="text-small text-walshe-grey">{label}</dt>
                  <dd className="text-right text-small font-medium text-walshe-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {(entry.highlights ?? []).length > 0 && (
          <div>
            <h3 className="mb-2 text-small font-semibold text-walshe-ink">Highlights</h3>
            <ul className="list-disc space-y-1 pl-5 text-small text-walshe-ink">
              {entry.highlights.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        )}

        {(entry.custom_sections ?? []).map((s, i) => (
          <div key={i}>
            <h3 className="mb-1 text-small font-semibold text-walshe-ink">{s.title}</h3>
            <p className="whitespace-pre-wrap text-small text-walshe-ink">{s.body}</p>
          </div>
        ))}

        <div>
          <h3 className="mb-2 text-small font-semibold text-walshe-ink">Items ({items.length})</h3>
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

        {(entry.created_by_email || entry.org_name) && (
          <p className="border-t border-walshe-line pt-3 text-[12px] text-walshe-grey">
            Provided by {entry.created_by_email || "—"}{entry.org_name ? ` · ${entry.org_name}` : ""}
          </p>
        )}
      </div>
    </Dialog>
  );
}
