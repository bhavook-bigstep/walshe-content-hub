"use client";

import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  addBlocklistTerm,
  listBlocklist,
  removeBlocklistTerm,
  type BlocklistTerm,
} from "../../../lib/api";

// AC36 — off-limits list. A term flagged here hides any matching entry from every agent, everywhere.
export default function BlocklistPage() {
  const [terms, setTerms] = useState<BlocklistTerm[] | null>(null);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBlocklist()
      .then((t) => !cancelled && setTerms(t))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not load the list."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const value = term.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const added = await addBlocklistTerm(value);
      setTerms((t) => {
        const rest = (t ?? []).filter((x) => x.id !== added.id);
        return [...rest, added].sort((a, b) => a.term.localeCompare(b.term));
      });
      setTerm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the term.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setError(null);
    try {
      await removeBlocklistTerm(id);
      setTerms((t) => (t ?? []).filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove the term.");
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "Off-limits" }]}
        title="Off-limits"
        description="Flag a subject or place off-limits. Any content that mentions it is hidden from every agent — in the catalog, search and the Design Studio."
      />

      <form onSubmit={onAdd} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="flex-1 text-small" style={{ minWidth: "14rem" }}>
          <span className="label">Off-limits term</span>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="field"
            placeholder="e.g. a closed attraction, a place name"
            aria-label="Off-limits term"
          />
        </label>
        <button type="submit" disabled={busy || !term.trim()} className="btn-primary h-12 disabled:opacity-60">
          {busy ? "Adding…" : "Add term"}
        </button>
      </form>

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {terms === null ? (
        <div className="card h-40 animate-pulse bg-walshe-stone/60" aria-hidden />
      ) : terms.length === 0 ? (
        <div className="card p-8 text-center text-body text-walshe-grey">
          Nothing is off-limits yet. Add a term above to hide matching content from agents.
        </div>
      ) : (
        <ul data-testid="blocklist" className="card divide-y divide-walshe-line p-0">
          {terms.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <span className="font-medium text-walshe-ink">{t.term}</span>
              <button
                type="button"
                onClick={() => void remove(t.id)}
                className="btn-ghost text-walshe-danger"
                aria-label={`Remove ${t.term}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
