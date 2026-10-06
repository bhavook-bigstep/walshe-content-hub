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

  if (entry === null)
    return <Dialog title="Entry" open={false} onClose={onClose}>{null}</Dialog>;

  const location =
    [entry.city, entry.state, entry.country].filter(Boolean).join(", ") || entry.destination;
  const attrs = (entry.attributes ?? {}) as Record<string, unknown>;
  const fields = (templates?.templates?.[entry.type] ?? []).filter((f) => {
    const v = attrs[f.key];
    return v !== null && v !== undefined && String(v) !== "";
  });
  const expired = entry.display_status === "expired";
  const items = entry.items ?? [];
  const imageItems = items.filter((it) => it.kind === "image");
  const textItems = items.filter((it) => it.kind === "text");
  const videoItems = items.filter((it) => it.kind === "video");

  // The hero image: the entry's cover, else its first image item.
  const heroKey = entry.cover_object_key || imageItems[0]?.object_key || null;

  // Structured detail rows (template fields) shown as a two-column fact grid.
  const detailRows: Array<[string, string]> = fields.map((f) => [
    f.label,
    formatAttributeValue(attrs[f.key]),
  ]);

  // Compact "at a glance" facts for the media rail.
  const facts: Array<[string, string]> = [];
  if (entry.season) facts.push(["Season", entry.season.replace("_", "-")]);
  if (entry.valid_from) facts.push(["Valid from", fmtDate(entry.valid_from)]);
  facts.push(["Expires", entry.expires_at ? fmtDate(entry.expires_at) : "Never"]);
  if ((entry.market_tags ?? []).length) facts.push(["Markets", entry.market_tags.join(", ")]);

  const statusClass = expired
    ? "bg-walshe-danger/15 text-walshe-danger"
    : entry.display_status === "expiring_soon"
      ? "bg-walshe-warn/20 text-walshe-warn"
      : "bg-white/85 text-walshe-ink";

  return (
    <Dialog
      title={entry.title}
      open
      onClose={onClose}
      size="wide"
      titleHidden
      bodyClassName="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="grid md:grid-cols-[minmax(0,22rem)_1fr]">
        {/* ── Media rail: hero + at-a-glance facts + provenance ── */}
        <aside className="flex flex-col border-b border-walshe-line bg-walshe-stone/40 md:border-b-0 md:border-r">
          <div className="relative aspect-[4/3] w-full md:aspect-[3/4]">
            <CatalogThumb
              imageKey={heroKey}
              alt={entry.title}
              className={`h-full w-full ${expired ? "opacity-60 grayscale" : ""}`}
            />
            {/* Scrim carries the type/location eyebrow, title and status over the image. */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-walshe-deep/85 via-walshe-deep/35 to-transparent p-4 pt-10">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/80">
                {entry.type} · {location}
              </span>
              <h2 className="mt-0.5 text-h3 font-bold leading-tight text-white">{entry.title}</h2>
            </div>
            <span
              className={`absolute left-4 top-4 rounded-pill px-2.5 py-0.5 text-[11px] font-semibold shadow-sm backdrop-blur ${statusClass}`}
            >
              {STATUS_LABELS[entry.display_status] ?? entry.display_status}
            </span>
          </div>

          {facts.length > 0 && (
            <dl className="divide-y divide-walshe-line/60 px-5 py-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-small text-walshe-grey">{label}</dt>
                  <dd className="text-right text-small font-semibold text-walshe-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(entry.created_by_email || entry.org_name) && (
            <p className="mt-auto border-t border-walshe-line/60 px-5 py-3 text-[12px] text-walshe-grey">
              Provided by{" "}
              <span className="font-medium text-walshe-ink">{entry.created_by_email || "—"}</span>
              {entry.org_name ? ` · ${entry.org_name}` : ""}
            </p>
          )}
        </aside>

        {/* ── Detail column (scrolls with the dialog body) ── */}
        <div className="space-y-6 p-6">
          {entry.description && (
            <p className="text-body leading-relaxed text-walshe-ink">{entry.description}</p>
          )}

          {detailRows.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-[11px]">Details</h3>
              <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-walshe-line bg-walshe-line sm:grid-cols-2">
                {detailRows.map(([label, value]) => (
                  <div key={label} className="bg-walshe-base px-3.5 py-2.5">
                    <dt className="text-[11px] uppercase tracking-wide text-walshe-grey">{label}</dt>
                    <dd className="mt-0.5 text-small font-medium text-walshe-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {(entry.highlights ?? []).length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-[11px]">Highlights</h3>
              <ul className="space-y-1.5">
                {entry.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2 text-small text-walshe-ink">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-walshe-teal" />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(entry.custom_sections ?? []).map((s, i) => (
            <section key={i}>
              <h3 className="eyebrow mb-1.5 text-[11px]">{s.title}</h3>
              <p className="whitespace-pre-wrap text-small leading-relaxed text-walshe-ink">{s.body}</p>
            </section>
          ))}

          {textItems.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-[11px]">Copy</h3>
              <div className="space-y-3">
                {textItems.map((it) => (
                  <div key={it.id} className="rounded-lg border border-walshe-line bg-walshe-stone/30 p-3.5">
                    {it.title && (
                      <p className="mb-1 text-small font-semibold text-walshe-ink">{it.title}</p>
                    )}
                    <p className="whitespace-pre-wrap text-body text-walshe-ink">{it.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {imageItems.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-[11px]">Gallery ({imageItems.length})</h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {imageItems.map((it) => (
                  <figure key={it.id} className="overflow-hidden rounded-lg border border-walshe-line">
                    <CatalogThumb
                      imageKey={it.object_key}
                      alt={it.title || it.alt || "image"}
                      className="aspect-square w-full"
                    />
                    {it.title && (
                      <figcaption className="truncate bg-walshe-base px-2 py-1 text-[11px] text-walshe-grey">
                        {it.title}
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
            </section>
          )}

          {videoItems.length > 0 && (
            <section>
              <h3 className="eyebrow mb-2.5 text-[11px]">Video ({videoItems.length})</h3>
              <ul className="space-y-1.5">
                {videoItems.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 rounded-lg border border-walshe-line px-3 py-2 text-small text-walshe-ink">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-walshe-grey">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {it.title || "Video"} <span className="text-walshe-grey">· {it.content_type}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {items.length === 0 && detailRows.length === 0 && (entry.highlights ?? []).length === 0 && (
            <p className="text-small text-walshe-grey">No further details for this entry yet.</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
