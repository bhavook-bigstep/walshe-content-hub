"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import PageHeader from "../../../components/ui/PageHeader";
import Select from "../../../components/ui/Select";
import {
  ApiError,
  createCollection,
  getGeo,
  listAgentCatalog,
  listCollections,
  updateCollection,
  type CatalogQuery,
  type CatalogType,
  type Collection,
  type Entry,
  type GeoData,
} from "../../../lib/api";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

// Human labels for the derived lifecycle status (AC32). Only approved/expiring_soon items ever
// reach the agent catalog, but the badge renders whatever status the API serialises.
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

// The API may expose a thumbnail object key on an entry; absent keys fall back to a placeholder.
type EntryWithImage = Entry & { image_key?: string | null };

export default function AgentCatalogPage() {
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [season, setSeason] = useState("");
  const [type, setType] = useState<CatalogType | "">("");
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [query, setQuery] = useState<CatalogQuery>({});
  const [entries, setEntries] = useState<EntryWithImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EntryWithImage[]>([]);

  // Collections (AC31): browse-time "save to collection" without leaving the catalog.
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectFor, setCollectFor] = useState<EntryWithImage | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    listAgentCatalog(query)
      .then((r) => !cancelled && setEntries(r as EntryWithImage[]))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the catalog."));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    listCollections()
      .then((c) => !cancelled && setCollections(c))
      .catch(() => {});
    getGeo()
      .then((g) => !cancelled && setGeo(g))
      .catch(() => {});
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

  function add(entry: EntryWithImage) {
    setSelected((s) => (s.some((x) => x.id === entry.id) ? s : [...s, entry]));
  }

  // Count how many of the agent's collections already hold a given entry.
  function collectionsWith(entryId: number): number {
    return collections.filter((c) => c.item_ids.includes(entryId)).length;
  }

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Catalog" }]}
        title="Catalog"
        description="Search approved, brand-safe destination content. Add it to a composition or save it to a collection."
      />

      <form onSubmit={onSearch} role="search" className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="flex-1 text-small" style={{ minWidth: "12rem" }}>
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field" placeholder="Keyword" />
        </label>
        <div className="text-small" style={{ minWidth: "10rem" }}>
          <span className="label">Country</span>
          <Select
            aria-label="Country"
            value={country}
            placeholder="All"
            onChange={(v) => { setCountry(v); setState(""); setCity(""); }}
            options={[{ value: "", label: "All" }, ...countries.map((c) => ({ value: c.name, label: c.name }))]}
          />
        </div>
        <div className="text-small" style={{ minWidth: "10rem" }}>
          <span className="label">State / region</span>
          <Select
            aria-label="State or region"
            value={state}
            placeholder="All"
            disabled={!country}
            onChange={(v) => { setState(v); setCity(""); }}
            options={[{ value: "", label: "All" }, ...states.map((s) => ({ value: s.name, label: s.name }))]}
          />
        </div>
        <div className="text-small" style={{ minWidth: "10rem" }}>
          <span className="label">City</span>
          <Select
            aria-label="City"
            value={city}
            placeholder="All"
            disabled={!state}
            onChange={setCity}
            options={[{ value: "", label: "All" }, ...cities.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <div className="text-small" style={{ minWidth: "9rem" }}>
          <span className="label">Season</span>
          <Select
            aria-label="Season"
            value={season}
            placeholder="All"
            onChange={setSeason}
            options={[{ value: "", label: "All" }, ...(geo?.seasons ?? []).map((s) => ({ value: s.value, label: s.label }))]}
          />
        </div>
        <div className="text-small" style={{ minWidth: "9rem" }}>
          <span className="label">Type</span>
          <Select
            aria-label="Type"
            value={type}
            placeholder="All"
            onChange={(v) => setType(v as CatalogType | "")}
            options={[{ value: "", label: "All" }, ...TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]}
          />
        </div>
        <button type="submit" className="btn-primary h-12">
          Search
        </button>
      </form>

      {selected.length > 0 && (
        <section aria-label="Composition" className="card mb-6 p-4">
          <h2 className="text-small font-semibold text-walshe-ink">In composition ({selected.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-small">
            {selected.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-2 rounded-pill bg-walshe-stone px-3 py-1 text-walshe-ink">
                {s.title}
                <button
                  type="button"
                  aria-label={`Remove ${s.title}`}
                  onClick={() => setSelected((all) => all.filter((x) => x.id !== s.id))}
                  className="text-walshe-mint/70 hover:text-walshe-mint"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <Link href="/agent/studio" className="btn-secondary mt-4">
            Open Design Studio
          </Link>
        </section>
      )}

      {error && (
        <p role="alert" className="card border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}
      {!error && entries === null && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="card h-72 animate-pulse bg-walshe-stone/60" />
          ))}
        </ul>
      )}
      {entries && entries.length === 0 && (
        <div className="card p-8 text-center text-body text-walshe-grey">
          No approved content matches your filters.
        </div>
      )}
      {entries && entries.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {entries.map((e) => {
            const added = selected.some((x) => x.id === e.id);
            const inCollections = collectionsWith(e.id);
            // AC55 — expired entries are shown greyed and can't be added to a composition.
            const expired = e.display_status === "expired";
            return (
              <li key={e.id} className={`card card-hover group flex flex-col overflow-hidden ${expired ? "opacity-70" : ""}`}>
                <div className="relative">
                  <CatalogThumb imageKey={e.cover_object_key || e.image_key || e.asset_keys?.[0]} alt={e.title} className={expired ? "grayscale" : undefined} />
                  <span className="chip-verified absolute left-3.5 top-3.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--walshe-green))" strokeWidth="3" aria-hidden>
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Verified
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="eyebrow text-[11px] capitalize">
                      {e.type} · {e.destination}
                    </div>
                    <span
                      data-testid="entry-status"
                      className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold ${
                        expired
                          ? "bg-walshe-danger/15 text-walshe-danger"
                          : e.display_status === "expiring_soon"
                            ? "bg-walshe-warn/15 text-walshe-warn"
                            : "bg-walshe-stone text-walshe-grey"
                      }`}
                    >
                      {STATUS_LABELS[e.display_status] ?? e.display_status}
                    </span>
                  </div>
                  {e.expires_at && (
                    <p data-testid="entry-validity" className="text-[11px] text-walshe-grey">
                      Expires {formatExpiry(e.expires_at)}
                    </p>
                  )}
                  <h3 className="text-h3 text-walshe-ink">{e.title}</h3>
                  <p className="line-clamp-3 text-small text-walshe-grey">{e.description}</p>
                  <div className="mt-auto flex flex-col gap-2 pt-2">
                    <button
                      type="button"
                      disabled={added || expired}
                      onClick={() => add(e)}
                      className="btn-secondary w-full disabled:opacity-60"
                    >
                      {expired ? "Expired — can't add" : added ? "Added to composition" : "Add to composition"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollectFor(e)}
                      className="btn-ghost w-full justify-center"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                      </svg>
                      {inCollections > 0 ? `Saved · in ${inCollections}` : "Add to collection"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {collectFor && (
        <CollectionModal
          entry={collectFor}
          collections={collections}
          onClose={() => setCollectFor(null)}
          onChange={setCollections}
          onSaved={(name) => notify(`Saved “${collectFor.title}” to ${name}.`)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-pill bg-walshe-ink px-5 py-2.5 text-small font-medium text-walshe-base shadow-lift"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// Modal to save a catalog entry into one of the agent's collections, or into a brand-new one.
function CollectionModal({
  entry,
  collections,
  onClose,
  onChange,
  onSaved,
}: {
  entry: Entry;
  collections: Collection[];
  onClose: () => void;
  onChange: (next: Collection[]) => void;
  onSaved: (collectionName: string) => void;
}) {
  const [busyId, setBusyId] = useState<number | "new" | null>(null);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addToExisting(c: Collection) {
    if (c.item_ids.includes(entry.id)) return;
    setBusyId(c.id);
    setError(null);
    try {
      const updated = await updateCollection(c.id, { item_ids: [...c.item_ids, entry.id] });
      onChange(collections.map((x) => (x.id === updated.id ? updated : x)));
      onSaved(updated.name);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the collection.");
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusyId("new");
    setError(null);
    try {
      const created = await createCollection({ name, item_ids: [entry.id] });
      onChange([...collections, created]);
      onSaved(created.name);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the collection.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${entry.title} to a collection`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-walshe-ink/50 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-walshe-line bg-walshe-base p-6 shadow-lift">
        <div className="mb-4">
          <p className="eyebrow text-[11px]">Collections</p>
          <h2 className="mt-1 text-h3 text-walshe-ink">Add to a collection</h2>
          <p className="mt-1 text-small text-walshe-grey">
            Save <span className="font-medium text-walshe-ink">{entry.title}</span> for later.
          </p>
        </div>

        {collections.length > 0 ? (
          <ul className="mb-5 flex max-h-56 flex-col gap-2 overflow-y-auto">
            {collections.map((c) => {
              const has = c.item_ids.includes(entry.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={has || busyId === c.id}
                    onClick={() => void addToExisting(c)}
                    className="flex w-full items-center justify-between rounded-md border border-walshe-line bg-walshe-stone/50 px-4 py-3 text-left text-small transition-colors hover:border-walshe-ink/30 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-walshe-ink">{c.name}</span>
                      <span className="text-walshe-grey">{c.item_ids.length} item{c.item_ids.length === 1 ? "" : "s"}</span>
                    </span>
                    <span className="flex-none text-small font-medium text-walshe-mint">
                      {has ? "Added ✓" : busyId === c.id ? "Adding…" : "Add"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mb-5 rounded-md bg-walshe-stone/50 px-4 py-3 text-small text-walshe-grey">
            You don’t have any collections yet. Create your first one below.
          </p>
        )}

        <form onSubmit={createAndAdd} className="border-t border-walshe-line pt-4">
          <span className="label">New collection</span>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(ev) => setNewName(ev.target.value)}
              className="field flex-1"
              placeholder="e.g. Autumn in Ireland"
              aria-label="New collection name"
            />
            <button type="submit" disabled={busyId === "new" || !newName.trim()} className="btn-primary flex-none disabled:opacity-60">
              {busyId === "new" ? "Creating…" : "Create"}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-small font-medium text-walshe-danger">
            {error}
          </p>
        )}

        <button type="button" onClick={onClose} className="btn-ghost mt-5 w-full justify-center">
          Done
        </button>
      </div>
    </div>
  );
}
