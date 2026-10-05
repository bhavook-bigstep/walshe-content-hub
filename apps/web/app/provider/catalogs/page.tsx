"use client";

import { useEffect, useState } from "react";
import {
  createCatalog,
  listCatalogs,
  shareCatalog,
  updateCatalog,
  type Catalog,
  type CatalogVisibility,
} from "../../../lib/api";

// AC49 — a provider manages their catalog library: create catalogs, publish (public) or keep
// private, and share private catalogs with specific agents (catalog sharing is the access gate).
export default function CatalogLibraryPage() {
  const [catalogs, setCatalogs] = useState<Catalog[] | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [visibility, setVisibility] = useState<CatalogVisibility>("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      setCatalogs(await listCatalogs());
    } catch {
      setCatalogs([]);
    }
  }
  useEffect(() => {
    void reload();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCatalog({ name: name.trim(), category: category.trim(), visibility });
      setName("");
      setCategory("");
      setVisibility("private");
      await reload();
    } catch {
      setError("Could not create the catalog.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisibility(c: Catalog) {
    const next: CatalogVisibility = c.visibility === "public" ? "private" : "public";
    await updateCatalog(c.id, { visibility: next });
    await reload();
  }

  async function setShare(c: Catalog, raw: string) {
    const ids = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    await shareCatalog(c.id, ids);
    await reload();
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-[11px]">Catalog library</p>
        <h1 className="text-h1 text-walshe-ink">Catalogs</h1>
        <p className="mt-1 text-body text-walshe-grey">
          Group your entries into catalogs. A <strong>public</strong> catalog is usable by every
          agent; a <strong>private</strong> catalog is usable only by the agents you share it with.
        </p>
      </header>

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-5" aria-label="New catalog">
        <label className="flex flex-col gap-1">
          <span className="label mb-0">Name</span>
          <input className="field h-10 w-56" value={name} onChange={(e) => setName(e.target.value)} aria-label="Catalog name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label mb-0">Category</span>
          <input className="field h-10 w-44" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catalog category" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label mb-0">Visibility</span>
          <select
            className="field h-10 w-36"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as CatalogVisibility)}
            aria-label="Catalog visibility"
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </label>
        <button type="submit" className="btn-primary h-10" disabled={busy}>
          {busy ? "Creating…" : "Create catalog"}
        </button>
        {error && <span role="alert" className="text-small text-walshe-danger">{error}</span>}
      </form>

      {catalogs === null ? (
        <p role="status" className="text-small text-walshe-grey">Loading catalogs…</p>
      ) : catalogs.length === 0 ? (
        <p role="status" className="text-small text-walshe-grey">No catalogs yet. Create one above.</p>
      ) : (
        <ul className="space-y-3" aria-label="Catalog list">
          {catalogs.map((c) => (
            <li key={c.id} className="card p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-h3 text-walshe-ink">{c.name}</h2>
                {c.category && <span className="text-small text-walshe-grey">· {c.category}</span>}
                <span
                  className={`rounded-pill px-3 py-0.5 text-[12px] font-semibold ${
                    c.visibility === "public"
                      ? "bg-walshe-teal text-white"
                      : "bg-walshe-ink/10 text-walshe-grey"
                  }`}
                >
                  {c.visibility}
                </span>
                <span className="text-small text-walshe-grey">{c.entry_count} entries</span>
                <button type="button" className="btn-secondary ml-auto h-9" onClick={() => void toggleVisibility(c)}>
                  Make {c.visibility === "public" ? "private" : "public"}
                </button>
              </div>
              {c.visibility === "private" && (
                <label className="mt-3 flex flex-col gap-1">
                  <span className="label mb-0">Shared with agent ids (comma-separated)</span>
                  <input
                    className="field h-10 w-full max-w-md"
                    defaultValue={(c.shared_agent_ids ?? []).join(", ")}
                    onBlur={(e) => void setShare(c, e.target.value)}
                    aria-label={`Share ${c.name} with agent ids`}
                  />
                </label>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
