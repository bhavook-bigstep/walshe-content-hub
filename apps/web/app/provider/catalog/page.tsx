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
  importAutoCatalog,
  listMyEntries,
  type Catalog,
  type ContentTemplates,
  type Entry,
  type GeoData,
} from "../../../lib/api";
import { JOBS_CHANGED_EVENT } from "../../../lib/jobs";

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

// AC68 — a small marker so AI-generated drafts are visible at a glance (and filterable).
function AiCreatedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-pill bg-walshe-gold/90 px-2.5 py-0.5 text-[11px] font-semibold text-walshe-ink ${className}`}>
      AI-created
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
                    {e.ai_created && <AiCreatedBadge className="absolute left-3 top-11" />}
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
  const [importOpen, setImportOpen] = useState(false);
  // AC68 — filter the catalog to all / only AI-created / only hand-authored entries.
  const [filter, setFilter] = useState<"all" | "ai" | "manual">("all");

  async function reload() {
    setCatalog(await getMyCatalog().catch(() => null));
    setEntries(await listMyEntries().catch(() => []));
  }
  useEffect(() => {
    // Honor the notification-bell deep link (AC74): ?ai_created=true lands on the AI-created drafts.
    try {
      if (new URLSearchParams(window.location.search).get("ai_created") === "true") {
        setFilter("ai");
      }
    } catch {
      /* no window / malformed query — fall back to the default "all" filter */
    }
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
        action={
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>
              Import from document
            </button>
            <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
              New entry
            </button>
          </div>
        }
      />

      {entries !== null && entries.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filter entries">
          {([
            ["all", "All"],
            ["ai", "AI-created"],
            ["manual", "Manual"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-pill px-3.5 py-1.5 text-small font-semibold ${
                filter === key ? "bg-walshe-ink text-white" : "bg-walshe-stone/60 text-walshe-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
        (() => {
          const shown = entries.filter((e) =>
            filter === "all" ? true : filter === "ai" ? e.ai_created : !e.ai_created,
          );
          return (
            <div className="space-y-10">
              <EntrySection
                title="Public"
                blurb="Visible to every agent."
                entries={shown.filter((e) => e.visibility === "public")}
              />
              <EntrySection
                title="Private"
                blurb="Visible only to invited agents."
                entries={shown.filter((e) => e.visibility === "private")}
              />
              <EntrySection
                title="Drafts"
                blurb="Hidden from agents until you publish them."
                entries={shown.filter((e) => e.visibility === "draft")}
              />
            </div>
          );
        })()
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

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onQueued={() => {
          setImportOpen(false);
          // The import runs asynchronously (AC71); the navbar bell announces when drafts are ready.
          // Tell the bell to re-poll NOW so the new job entry shows the moment Import is clicked.
          window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
          // Pre-select the AI filter so a reload surfaces the new drafts the moment the job finishes.
          setFilter("ai");
          void reload();
        }}
      />
    </div>
  );
}

// AC71 — upload a document; the Auto-Catalog agent runs asynchronously and turns it into draft
// entries to review. Import returns immediately (202); the navbar bell announces completion (AC74).
function ImportDialog({
  open,
  onClose,
  onQueued,
}: {
  open: boolean;
  onClose: () => void;
  onQueued: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importAutoCatalog(file);
      setFile(null);
      onQueued();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Import from document" open={open} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-small text-walshe-grey">
          Upload a PDF, PNG or JPEG. The Auto-Catalog agent runs in the background and creates draft
          entries you can review, edit and then publish — the bell in the top bar tells you when
          they are ready. Nothing is shown to agents until you publish.
        </p>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          aria-label="Document to import"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-small"
        />
        {error && <p className="text-small text-walshe-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={!file || busy}>
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </Dialog>
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
