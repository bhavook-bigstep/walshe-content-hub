"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { listCollections, createCollection, deleteCollection, type Collection } from "../../../lib/api";

// Reusable groups of catalog items (AC28). Agent-only; the API re-checks the role.
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCollections(await listCollections());
    } catch (e) {
      setCollections([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError("Collection name is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await createCollection({ name: trimmed });
      setCollections((prev) => (prev ? [created, ...prev] : [created]));
      setName("");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setPendingId(id);
    setError(null);
    try {
      await deleteCollection(id);
      setCollections((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPendingId(null);
    }
  }

  const loading = collections === null;

  return (
    <div>
      <PageHeader title="Collections" description="Group catalog items you want to reuse." />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="card mb-8 p-6" aria-busy={busy}>
        <label className="block">
          <span className="label">Collection name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Autumn campaign"
            className="field"
          />
        </label>
        {formError && (
          <p role="alert" className="mt-3 text-small font-medium text-walshe-danger">
            {formError}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary mt-4">
          {busy ? "Creating…" : "Create"}
        </button>
      </form>

      {loading && !error ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : collections && collections.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <div key={c.id} className="card p-5">
              <p className="font-medium text-walshe-ink">{c.name}</p>
              <p className="mt-1 text-small text-walshe-grey">{c.item_ids.length} items</p>
              <button
                type="button"
                disabled={pendingId === c.id}
                onClick={() => void remove(c.id)}
                className="btn-ghost mt-4 text-walshe-danger"
              >
                {pendingId === c.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        !error && (
          <div className="card p-8 text-center text-walshe-grey">
            No collections yet — create one above to group catalog items.
          </div>
        )
      )}
    </div>
  );
}
