"use client";

import { useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import EntryDetailModal from "../../../components/catalog/EntryDetailModal";
import Dialog from "../../../components/ui/Dialog";
import PageHeader from "../../../components/ui/PageHeader";
import Select from "../../../components/ui/Select";
import {
  ApiError,
  addCollectionItem,
  createCollection,
  getGeo,
  listAgentCatalog,
  listCollections,
  type CatalogQuery,
  type CatalogType,
  type Collection,
  type Entry,
  type GeoData,
} from "../../../lib/api";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

const STATUS_LABELS: Record<string, string> = {
  approved: "Available",
  expiring_soon: "Expiring soon",
  expired: "Expired",
  draft: "Draft",
  in_review: "In review",
  withdrawn: "Withdrawn",
};

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// AC59 — the Catalog is a search/query LIBRARY of provider content. The agent searches and saves
// references to entries into Collections (no copy is made). Clicking an entry opens its items.
export default function AgentCatalogPage() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [season, setSeason] = useState("");
  const [type, setType] = useState<CatalogType | "">("");
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [query, setQuery] = useState<CatalogQuery>({});
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [saveFor, setSaveFor] = useState<Entry | null>(null);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    listAgentCatalog(query)
      .then((r) => !cancelled && setEntries(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the catalog."));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    listCollections().then((c) => !cancelled && setCollections(c)).catch(() => {});
    getGeo().then((g) => !cancelled && setGeo(g)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const countries = geo?.countries ?? [];
  const states = countries.find((c) => c.name === country)?.states ?? [];
  const cities = states.find((s) => s.name === state)?.cities ?? [];

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQuery({
      q: q.trim() || undefined,
      country: country || undefined,
      state: state || undefined,
      city: city || undefined,
      season: (season || undefined) as CatalogQuery["season"],
      type: type || undefined,
    });
  }

  function clearFilters() {
    setQ(""); setCountry(""); setState(""); setCity(""); setSeason(""); setType("");
    setQuery({});
  }

  function savedCount(entryId: number): number {
    return collections.filter((c) => c.item_ids.includes(entryId)).length;
  }

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  }

  const active = Object.keys(query).length > 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Catalog" }]}
        title="Catalog"
        description="Search verified destination content and save what you like to a collection."
      />

      <form onSubmit={onSearch} role="search" className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-small" style={{ minWidth: "14rem" }}>
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field" placeholder="Keyword, e.g. festival" />
        </label>
        <div className="text-small" style={{ minWidth: "9rem" }}>
          <span className="label">Country</span>
          <Select aria-label="Country" value={country} placeholder="All"
            onChange={(v) => { setCountry(v); setState(""); setCity(""); }}
            options={[{ value: "", label: "All" }, ...countries.map((c) => ({ value: c.name, label: c.name }))]} />
        </div>
        <div className="text-small" style={{ minWidth: "9rem" }}>
          <span className="label">State / region</span>
          <Select aria-label="State or region" value={state} placeholder="All" disabled={!country}
            onChange={(v) => { setState(v); setCity(""); }}
            options={[{ value: "", label: "All" }, ...states.map((s) => ({ value: s.name, label: s.name }))]} />
        </div>
        <div className="text-small" style={{ minWidth: "9rem" }}>
          <span className="label">City</span>
          <Select aria-label="City" value={city} placeholder="All" disabled={!state}
            onChange={setCity}
            options={[{ value: "", label: "All" }, ...cities.map((c) => ({ value: c, label: c }))]} />
        </div>
        <div className="text-small" style={{ minWidth: "8rem" }}>
          <span className="label">Season</span>
          <Select aria-label="Season" value={season} placeholder="All" onChange={setSeason}
            options={[{ value: "", label: "All" }, ...(geo?.seasons ?? []).map((s) => ({ value: s.value, label: s.label }))]} />
        </div>
        <div className="text-small" style={{ minWidth: "8rem" }}>
          <span className="label">Type</span>
          <Select aria-label="Type" value={type} placeholder="All" onChange={(v) => setType(v as CatalogType | "")}
            options={[{ value: "", label: "All" }, ...TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]} />
        </div>
        <button type="submit" className="btn-primary h-12">Search</button>
        {active && (
          <button type="button" className="btn-ghost h-12" onClick={clearFilters}>Clear</button>
        )}
      </form>

      {error && (
        <p role="alert" className="card border-walshe-danger/30 p-4 text-small text-walshe-danger">{error}</p>
      )}

      {!error && entries !== null && (
        <p className="mb-3 text-small text-walshe-grey">
          {entries.length} {entries.length === 1 ? "result" : "results"}{active ? " for your search" : " in the catalog"}
        </p>
      )}

      {entries === null && !error ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-72 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : entries && entries.length === 0 ? (
        <div className="card p-10 text-center text-body text-walshe-grey">
          No content matches your search. Try broadening the filters.
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(entries ?? []).map((e) => {
            const expired = e.display_status === "expired";
            const saved = savedCount(e.id);
            return (
              <li key={e.id} className={`card card-hover group flex flex-col overflow-hidden ${expired ? "opacity-70" : ""}`}>
                <button
                  type="button"
                  onClick={() => setOpenEntry(e)}
                  aria-label={`Open ${e.title}`}
                  className="relative block text-left"
                >
                  <CatalogThumb imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className={`aspect-[4/3] w-full ${expired ? "grayscale" : ""}`} />
                  <span className="chip-verified absolute left-3.5 top-3.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--walshe-green))" strokeWidth="3" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </span>
                </button>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="eyebrow text-[11px] capitalize">{e.type} · {e.destination}</div>
                    <span
                      data-testid="entry-status"
                      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
                        expired ? "bg-walshe-danger/15 text-walshe-danger"
                          : e.display_status === "expiring_soon" ? "bg-walshe-warn/15 text-walshe-warn"
                            : "bg-walshe-stone text-walshe-grey"
                      }`}
                    >
                      {STATUS_LABELS[e.display_status] ?? e.display_status}
                    </span>
                  </div>
                  {e.expires_at && (
                    <p data-testid="entry-validity" className="text-[11px] text-walshe-grey">Expires {formatExpiry(e.expires_at)}</p>
                  )}
                  <h3 className="text-h3 text-walshe-ink">
                    <button type="button" onClick={() => setOpenEntry(e)} className="text-left hover:underline">
                      {e.title}
                    </button>
                  </h3>
                  <p className="line-clamp-2 text-small text-walshe-grey">{e.description}</p>
                  <p className="text-[12px] text-walshe-grey">{e.items?.length ?? 0} items</p>
                  <div className="mt-auto pt-2">
                    <button
                      type="button"
                      disabled={expired}
                      onClick={() => setSaveFor(e)}
                      className="btn-secondary w-full disabled:opacity-60"
                    >
                      {expired ? "Expired — can't save" : saved > 0 ? `Saved · in ${saved}` : "Save to collection"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <EntryDetailModal entry={openEntry} onClose={() => setOpenEntry(null)} />

      {saveFor && (
        <SaveModal
          entry={saveFor}
          collections={collections}
          onClose={() => setSaveFor(null)}
          onSaved={(updated, msg) => { setCollections(updated); notify(msg); setSaveFor(null); }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-pill bg-walshe-ink px-4 py-2 text-small font-medium text-white shadow-lift">
          {toast}
        </div>
      )}
    </div>
  );
}

// AC59 — save an entry reference into a collection (new or existing).
function SaveModal({
  entry,
  collections,
  onClose,
  onSaved,
}: {
  entry: Entry;
  collections: Collection[];
  onClose: () => void;
  onSaved: (collections: Collection[], msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addToExisting(c: Collection) {
    setBusy(true);
    setError(null);
    try {
      const updated = await addCollectionItem(c.id, entry.id);
      onSaved(collections.map((x) => (x.id === c.id ? updated : x)), `Saved to ${c.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
      setBusy(false);
    }
  }

  async function createAndAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCollection({ name: name.trim(), item_ids: [entry.id] });
      onSaved([created, ...collections], `Saved to ${created.name}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the collection.");
      setBusy(false);
    }
  }

  return (
    <Dialog title="Save to a collection" ariaLabel={`Save ${entry.title} to a collection`} size="md" open onClose={onClose}>
      {collections.length > 0 && (
        <ul className="mb-4 space-y-2" aria-label="Your collections">
          {collections.map((c) => {
            const has = c.item_ids.includes(entry.id);
            return (
              <li key={c.id}>
                <button type="button" disabled={busy || has} onClick={() => addToExisting(c)}
                  className="flex w-full items-center justify-between rounded-lg border border-walshe-line px-4 py-2.5 text-left text-small hover:bg-walshe-ink/5 disabled:opacity-60">
                  <span className="font-medium text-walshe-ink">{c.name}</span>
                  <span className="text-walshe-grey">{has ? "Saved ✓" : `${c.item_ids.length} items`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={createAndAdd} className="border-t border-walshe-line pt-4">
        <label className="block">
          <span className="label">New collection name</span>
          <input className="field h-11" value={name} onChange={(e) => setName(e.target.value)} aria-label="New collection name" placeholder="e.g. West coast picks" />
        </label>
        {error && <p role="alert" className="mt-2 text-small text-walshe-danger">{error}</p>}
        <button type="submit" className="btn-primary mt-3" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Create & save"}
        </button>
      </form>
    </Dialog>
  );
}
