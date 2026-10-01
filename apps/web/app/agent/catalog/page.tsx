"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  listAgentCatalog,
  type CatalogQuery,
  type CatalogType,
  type Entry,
} from "../../../lib/api";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

// The API may expose a thumbnail object key on an entry; absent keys fall back to a placeholder.
type EntryWithImage = Entry & { image_key?: string | null };

export default function AgentCatalogPage() {
  const [q, setQ] = useState("");
  const [destination, setDestination] = useState("");
  const [type, setType] = useState<CatalogType | "">("");
  const [query, setQuery] = useState<CatalogQuery>({});
  const [entries, setEntries] = useState<EntryWithImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EntryWithImage[]>([]);

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

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setQuery({ q: q.trim() || undefined, destination: destination.trim() || undefined, type: type || undefined });
  }

  function add(entry: EntryWithImage) {
    setSelected((s) => (s.some((x) => x.id === entry.id) ? s : [...s, entry]));
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Catalog" }]}
        title="Catalog"
        description="Search approved, brand-safe destination content and add it to a composition."
      />

      <form onSubmit={onSearch} role="search" className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        <label className="flex-1 text-small" style={{ minWidth: "12rem" }}>
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field" placeholder="Keyword" />
        </label>
        <label className="flex-1 text-small" style={{ minWidth: "12rem" }}>
          <span className="label">Destination</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="field"
            placeholder="Any destination"
          />
        </label>
        <label className="text-small">
          <span className="label">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as CatalogType | "")} className="field capitalize">
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary h-12">
          Search
        </button>
      </form>

      {selected.length > 0 && (
        <section aria-label="Composition" className="card mb-6 p-4">
          <h2 className="text-small font-semibold text-walshe-ink">In composition ({selected.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-small">
            {selected.map((s) => (
              <li key={s.id} className="inline-flex items-center gap-2 rounded-pill bg-walshe-teal-100 px-3 py-1 text-walshe-teal">
                {s.title}
                <button
                  type="button"
                  aria-label={`Remove ${s.title}`}
                  onClick={() => setSelected((all) => all.filter((x) => x.id !== s.id))}
                  className="text-walshe-teal/70 hover:text-walshe-teal"
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
            return (
              <li key={e.id} className="card card-hover flex flex-col overflow-hidden">
                <CatalogThumb imageKey={e.image_key ?? e.asset_keys?.[0]} alt={e.title} />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-walshe-ink">{e.title}</h3>
                    <span className="chip-verified shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                      Verified
                    </span>
                  </div>
                  <p className="text-small capitalize text-walshe-grey">
                    {e.type} · {e.destination}
                  </p>
                  <p className="line-clamp-3 text-small text-walshe-ink/80">{e.description}</p>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => add(e)}
                    className="btn-secondary mt-auto w-full disabled:opacity-60"
                  >
                    {added ? "Added" : "Add to composition"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
