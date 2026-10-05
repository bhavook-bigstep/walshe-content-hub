"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import EntryDetailModal from "../../../components/catalog/EntryDetailModal";
import Dialog from "../../../components/ui/Dialog";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  createCollection,
  createProject,
  deleteCollection,
  listCollections,
  removeCollectionItem,
  resolveCollection,
  updateCollection,
  type CollectionResolved,
  type Entry,
} from "../../../lib/api";

// AC60 — Collections hold saved references to catalog entries, resolved against the live catalog
// (stale/expired refs dropped). Open one to see its items, remove them, rename, or start a project.
export default function AgentCollectionsPage() {
  const [items, setItems] = useState<CollectionResolved[] | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const list = await listCollections().catch(() => []);
    const resolved = await Promise.all(list.map((c) => resolveCollection(c.id).catch(() => null)));
    setItems(resolved.filter((r): r is CollectionResolved => r !== null));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createCollection({ name: name.trim(), item_ids: [] });
      setName("");
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the collection.");
    } finally {
      setCreating(false);
    }
  }

  const open = items?.find((c) => c.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/agent" }, { label: "Collections" }]}
        title="Collections"
        description="Your saved picks from the catalog. Open one to manage it or start a design."
      />

      <form onSubmit={onCreate} className="card mb-6 flex items-end gap-3 p-4">
        <label className="flex-1 text-small">
          <span className="label">New collection</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} aria-label="Collection name" placeholder="e.g. Summer on the coast" />
        </label>
        <button type="submit" className="btn-primary h-12" disabled={creating || !name.trim()}>
          {creating ? "Creating…" : "Create"}
        </button>
      </form>
      {error && <p role="alert" className="mb-4 text-small text-walshe-danger">{error}</p>}

      {items === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-48 animate-pulse bg-walshe-stone/60" aria-hidden />)}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-body text-walshe-grey">
          No collections yet. Save content from the Catalog, or create one above.
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Collections">
          {items.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(c.id)} className="card card-hover block w-full overflow-hidden text-left">
                <div className="flex h-36 gap-0.5 bg-walshe-stone/40">
                  {c.items.slice(0, 3).map((e) => (
                    <CatalogThumb key={e.id} imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className="h-full flex-1" />
                  ))}
                  {c.items.length === 0 && <div className="grid flex-1 place-items-center text-small text-walshe-grey">Empty</div>}
                </div>
                <div className="space-y-1 p-5">
                  <h3 className="truncate text-h3 text-[1.0625rem] text-walshe-ink">{c.name}</h3>
                  <p className="text-small text-walshe-grey">
                    {c.items.length} {c.items.length === 1 ? "item" : "items"}
                    {c.dropped_item_ids.length > 0 && ` · ${c.dropped_item_ids.length} no longer available`}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <CollectionDetailDialog
          collection={open}
          onClose={() => setOpenId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}

function CollectionDetailDialog({
  collection,
  onClose,
  onChanged,
}: {
  collection: CollectionResolved;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState(collection.name);
  const [busy, setBusy] = useState(false);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  async function rename() {
    if (name.trim() && name.trim() !== collection.name) {
      await updateCollection(collection.id, { name: name.trim() });
      await onChanged();
    }
  }

  async function remove(entryId: number) {
    await removeCollectionItem(collection.id, entryId);
    await onChanged();
  }

  async function del() {
    await deleteCollection(collection.id);
    await onChanged();
    onClose();
  }

  async function useInStudio() {
    if (collection.items.length === 0) return;
    setBusy(true);
    try {
      const project = await createProject({
        name: collection.name,
        format: "social",
        item_ids: collection.items.map((e) => e.id),
        design: {},
      });
      router.push(`/agent/studio?project=${project.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={collection.name} open onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <label className="block flex-1">
            <span className="label">Name</span>
            <input className="field h-11" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} aria-label="Collection name" />
          </label>
          <button type="button" className="btn-primary h-11 whitespace-nowrap" disabled={busy || collection.items.length === 0} onClick={useInStudio}>
            Open in Design Studio
          </button>
        </div>

        {collection.dropped_item_ids.length > 0 && (
          <p className="rounded-sm border border-walshe-warn/40 bg-walshe-warn/10 p-2 text-small text-walshe-grey">
            {collection.dropped_item_ids.length} saved item(s) are no longer available and were removed from this view.
          </p>
        )}

        {collection.items.length === 0 ? (
          <p className="text-small text-walshe-grey">No items yet. Save content from the Catalog.</p>
        ) : (
          <ul className="space-y-2" aria-label="Collection items">
            {collection.items.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-walshe-line p-2">
                <button type="button" onClick={() => setOpenEntry(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <CatalogThumb imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className="h-12 w-16 flex-none rounded-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-small font-medium text-walshe-ink">{e.title}</span>
                    <span className="block truncate text-[12px] capitalize text-walshe-grey">{e.type} · {e.destination}</span>
                  </span>
                </button>
                <button type="button" aria-label={`Remove ${e.title}`} onClick={() => remove(e.id)}
                  className="grid h-8 w-8 flex-none place-items-center rounded-md text-walshe-grey hover:bg-walshe-danger/10 hover:text-walshe-danger">✕</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-between border-t border-walshe-line pt-4">
          <button type="button" className="btn-ghost text-walshe-danger" onClick={del}>Delete collection</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>

      <EntryDetailModal entry={openEntry} onClose={() => setOpenEntry(null)} />
    </Dialog>
  );
}
