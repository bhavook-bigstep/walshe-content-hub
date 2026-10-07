"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

// A small "i" button beside New entry / Import that opens a short note explaining both actions.
function ToolbarInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="About these actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
          open ? "border-walshe-ink/40 text-walshe-ink" : "border-walshe-line text-walshe-grey hover:border-walshe-ink/30 hover:text-walshe-ink"
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.75h.01" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="About these actions"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-md border border-walshe-line bg-walshe-paper p-4 text-left shadow-lift"
        >
          <dl className="space-y-3.5">
            <div>
              <dt className="text-small font-semibold text-walshe-ink">New entry</dt>
              <dd className="mt-1 text-small leading-relaxed text-walshe-grey">
                Create a catalog entry yourself — an event, place, offer or itinerary — then open it to add text and media.
              </dd>
            </div>
            <div>
              <dt className="text-small font-semibold text-walshe-ink">Import from document</dt>
              <dd className="mt-1 text-small leading-relaxed text-walshe-grey">
                Upload a PDF or image and the Auto-Catalog AI turns it into draft entries you can review, edit and publish. The bell tells you when they’re ready; nothing shows to agents until you publish.
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
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

  // Refetch the catalog + entries. A failed entries fetch keeps the previous list instead of
  // blanking it (a transient error right after an import must NOT empty the whole catalog).
  const reload = useCallback(async () => {
    const [cat, ent] = await Promise.all([
      getMyCatalog().catch(() => undefined),
      listMyEntries().catch(() => undefined),
    ]);
    if (cat !== undefined) setCatalog(cat);
    setEntries((prev) => (ent !== undefined ? ent : (prev ?? [])));
  }, []);

  useEffect(() => {
    void reload();
    void getContentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates(null));
    void getGeo()
      .then(setGeo)
      .catch(() => setGeo(null));
    // Refetch when an import is queued OR a finished job is opened from the bell (it dispatches this
    // event). Keeps the full catalog visible and surfaces new drafts without a manual page reload.
    const onJobs = () => void reload();
    window.addEventListener(JOBS_CHANGED_EVENT, onJobs);
    return () => window.removeEventListener(JOBS_CHANGED_EVENT, onJobs);
  }, [reload]);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "Catalog" }]}
        title="Catalog"
        action={
          <div className="flex items-center gap-2">
            <ToolbarInfo />
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
          // Keep the full catalog visible (do NOT switch to the AI-only filter — that blanked the
          // page until the job finished). New drafts land in Drafts when the job completes.
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
        {/* Styled file picker — the native control looks off, so hide it behind a labelled button
            and show the chosen filename beside it. */}
        <div className="flex items-center gap-3">
          <label className="inline-flex flex-none cursor-pointer items-center gap-2 rounded-pill border border-walshe-line px-4 py-2 text-small font-semibold text-walshe-ink transition-colors hover:border-walshe-teal hover:bg-walshe-ink/5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 20h16" />
            </svg>
            Choose file
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              aria-label="Document to import"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          <span className="min-w-0 flex-1 truncate text-small text-walshe-grey">
            {file ? file.name : "PDF, PNG or JPEG"}
          </span>
        </div>
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
