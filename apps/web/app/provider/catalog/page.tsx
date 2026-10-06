"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import Dialog from "../../../components/ui/Dialog";
import PageHeader from "../../../components/ui/PageHeader";
import EntryForm from "../../../components/provider/EntryForm";
import {
  getContentTemplates,
  getGeo,
  getMyCatalog,
  listMyEntries,
  type Catalog,
  type ContentTemplates,
  type Entry,
  type GeoData,
} from "../../../lib/api";

// AC54 — the three per-entry sets, shown as a badge so a provider sees each entry's reach.
const VISIBILITY_STYLES: Record<string, string> = {
  public: "bg-walshe-teal text-white",
  private: "bg-walshe-warn/90 text-walshe-ink",
  draft: "bg-walshe-ink/70 text-white",
};
function VisibilityBadge({ visibility, className = "" }: { visibility?: string; className?: string }) {
  const v = visibility ?? "draft";
  return (
    <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold capitalize ${VISIBILITY_STYLES[v] ?? VISIBILITY_STYLES.draft} ${className}`}>
      {v}
    </span>
  );
}

// AC54 — one of the three catalog sets (Public / Private / Drafts) as a titled grid of cards.
function EntrySection({ title, blurb, entries }: { title: string; blurb: string; entries: Entry[] }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-h3 text-walshe-ink">{title}</h2>
        <span className="text-small text-walshe-grey">{entries.length} · {blurb}</span>
      </div>
      {entries.length === 0 ? (
        <p className="card p-6 text-small text-walshe-grey">Nothing here yet.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => {
            const expired = e.display_status === "expired";
            return (
              <li key={e.id}>
                <Link
                  href={`/provider/catalog/${e.id}`}
                  className={`card card-hover group block overflow-hidden ${expired ? "opacity-60" : ""}`}
                >
                  <div className="relative">
                    <CatalogThumb imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className={`h-40 w-full transition-transform duration-500 group-hover:scale-105 ${expired ? "grayscale" : ""}`} />
                    <VisibilityBadge visibility={e.visibility} className="absolute left-3 top-3" />
                    {expired && (
                      <span className="absolute right-3 top-3 rounded-pill bg-walshe-ink/80 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 p-5">
                    <h3 className="truncate text-h3 text-[1.0625rem] text-walshe-ink">{e.title}</h3>
                    <p className="text-small capitalize text-walshe-grey">{e.type} · {e.destination}</p>
                    <p className="text-[12px] text-walshe-grey">{e.items?.length ?? 0} items</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// AC49/AC50 — the provider's single catalog: publish/share it, and manage its entries.
export default function ProviderCatalogPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [templates, setTemplates] = useState<ContentTemplates | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function reload() {
    setCatalog(await getMyCatalog().catch(() => null));
    setEntries(await listMyEntries().catch(() => []));
  }
  useEffect(() => {
    void reload();
    void getContentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates(null));
    void getGeo()
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "Catalog" }]}
        title="Catalog"
        description="Each entry is Draft (hidden), Public (every agent), or Private (invited agents only)."
        action={
          <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
            New entry
          </button>
        }
      />

      {entries === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-56 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-10 text-center sm:items-center">
          <h3 className="text-h3 text-walshe-ink">No entries yet</h3>
          <p className="max-w-md text-body text-walshe-grey">
            Add your first event, place, offer or itinerary, then open it to add text + media items.
          </p>
          <button type="button" className="btn-primary mt-1" onClick={() => setDialogOpen(true)}>
            New entry
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          <EntrySection
            title="Public"
            blurb="Visible to every agent."
            entries={entries.filter((e) => e.visibility === "public")}
          />
          <EntrySection
            title="Private"
            blurb="Visible only to invited agents."
            entries={entries.filter((e) => e.visibility === "private")}
          />
          <EntrySection
            title="Drafts"
            blurb="Hidden from agents until you publish them."
            entries={entries.filter((e) => e.visibility === "draft")}
          />
        </div>
      )}

      <NewEntryDialog
        open={dialogOpen}
        catalogId={catalog?.id ?? null}
        templates={templates}
        geo={geo}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          void reload();
        }}
      />
    </div>
  );
}

function NewEntryDialog({
  open,
  catalogId,
  templates,
  geo,
  onClose,
  onCreated,
}: {
  open: boolean;
  catalogId: number | null;
  templates: ContentTemplates | null;
  geo: GeoData | null;
  onClose: () => void;
  onCreated: (e: Entry) => void;
}) {
  return (
    <Dialog title="New entry" open={open} onClose={onClose}>
      <EntryForm
        mode="create"
        catalogId={catalogId}
        templates={templates}
        geo={geo}
        onDone={onCreated}
        onCancel={onClose}
      />
    </Dialog>
  );
}
