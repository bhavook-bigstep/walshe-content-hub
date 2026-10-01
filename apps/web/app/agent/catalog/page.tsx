"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  fetchAssetObjectUrl,
  listAgentCatalog,
  type CatalogQuery,
  type CatalogType,
  type Entry,
} from "../../../lib/api";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

// The API may expose a thumbnail object key on an entry; absent keys fall back to a placeholder.
type EntryWithImage = Entry & { image_key?: string | null };

function Thumb({ imageKey, alt }: { imageKey?: string | null; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!imageKey) return;
    let url: string | null = null;
    let cancelled = false;
    fetchAssetObjectUrl(imageKey)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else {
          url = u;
          setSrc(u);
        }
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageKey]);
  if (!src) return <div className="h-32 w-full rounded bg-slate-200" aria-hidden="true" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-32 w-full rounded object-cover" />;
}

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
    <main className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Catalog</h1>
        <Link href="/agent" className="text-sm underline">
          Agent home
        </Link>
      </div>

      <form onSubmit={onSearch} role="search" className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Destination
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="mt-1 block rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CatalogType | "")}
            className="mt-1 block rounded border border-slate-300 px-3 py-2"
          >
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-white">
          Search
        </button>
      </form>

      {selected.length > 0 && (
        <section aria-label="Composition" className="rounded-lg bg-white p-3 shadow">
          <h2 className="text-sm font-medium">In composition ({selected.length})</h2>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">
            {selected.map((s) => (
              <li key={s.id} className="rounded bg-slate-100 px-2 py-1">
                {s.title}
                <button
                  type="button"
                  aria-label={`Remove ${s.title}`}
                  onClick={() => setSelected((all) => all.filter((x) => x.id !== s.id))}
                  className="ml-2 text-slate-500"
                >
                  x
                </button>
              </li>
            ))}
          </ul>
          <Link href="/agent/studio" className="mt-2 inline-block text-sm underline">
            Open Design Studio
          </Link>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && entries === null && (
        <p role="status" className="text-sm text-slate-600">
          Loading catalog...
        </p>
      )}
      {entries && entries.length === 0 && <p className="text-sm text-slate-600">No approved content matches your filters.</p>}
      {entries && entries.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => {
            const added = selected.some((x) => x.id === e.id);
            return (
              <li key={e.id} className="space-y-2 rounded-lg bg-white p-3 shadow">
                <Thumb imageKey={e.image_key} alt={e.title} />
                <h3 className="font-medium">{e.title}</h3>
                <p className="text-xs text-slate-500">
                  {e.type} · {e.destination}
                </p>
                <p className="line-clamp-3 text-sm text-slate-700">{e.description}</p>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => add(e)}
                  className="rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-60"
                >
                  {added ? "Added" : "Add to composition"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
