"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../../components/catalog/CatalogThumb";
import Dialog from "../../../../components/ui/Dialog";
import PageHeader from "../../../../components/ui/PageHeader";
import Select from "../../../../components/ui/Select";
import EntryForm from "../../../../components/provider/EntryForm";
import {
  addTextItem,
  deleteEntry,
  deleteItem,
  generateEntryCover,
  getContentTemplates,
  getEntry,
  getGeo,
  listItems,
  sendBackEntry,
  setAccess,
  uploadEntryCover,
  uploadMediaItem,
  type ContentTemplates,
  type Entry,
  type GeoData,
  type Item,
} from "../../../../lib/api";
import { formatAttributeValue } from "../../../../lib/entry-attributes";

// AC50 — an entry's items (text + media) + add/remove; plus the review controls (AC34/35).
export default function ProviderEntryPage() {
  const id = Number(useParams().id);
  const router = useRouter();
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined);
  const [items, setItems] = useState<Item[] | null>(null);
  const [templates, setTemplates] = useState<ContentTemplates | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const reload = useCallback(async () => {
    setEntry(await getEntry(id).catch(() => null));
    setItems(await listItems(id).catch(() => []));
  }, [id]);
  useEffect(() => {
    void reload();
    void getContentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates(null));
    void getGeo()
      .then(setGeo)
      .catch(() => setGeo(null));
  }, [reload]);

  if (entry === null) {
    return (
      <div className="card p-10 text-center">
        <h2 className="text-h3 text-walshe-ink">Entry not found</h2>
        <Link href="/provider/catalog" className="btn-ghost mt-3">Back to catalog</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/provider" },
          { label: "Catalog", href: "/provider/catalog" },
          { label: entry?.title ?? "Entry" },
        ]}
        title={entry?.title ?? "Entry"}
        renderTitle
        description={entry ? `${entry.type} · ${entry.destination}` : ""}
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-ghost text-walshe-danger" onClick={() => setDeleteOpen(true)}>
              Delete
            </button>
            <button type="button" className="btn-secondary" onClick={() => setEditOpen(true)} disabled={!entry}>
              Edit
            </button>
            <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
              Add item
            </button>
          </div>
        }
      />

      {entry && (entry.created_by_email || entry.org_name) && (
        <p className="mb-6 text-small text-walshe-grey" aria-label="Provenance">
          Created by <span className="font-medium text-walshe-ink">{entry.created_by_email || "—"}</span>
          {entry.org_name && <> · {entry.org_name}</>}
          {entry.display_status === "expired" && (
            <span className="ml-2 rounded-pill bg-walshe-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white">Expired</span>
          )}
        </p>
      )}

      {entry && <CoverSection entry={entry} onChanged={reload} />}

      {entry && <EntryDetails entry={entry} templates={templates} />}

      <section aria-label="Items" className="mb-8">
        {items === null ? (
          <p role="status" className="text-small text-walshe-grey">Loading items…</p>
        ) : items.length === 0 ? (
          <div className="card p-8 text-center text-body text-walshe-grey">
            No items yet. Add text or media — these are what agents pull into the studio.
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Item list">
            {items.map((it) => (
              <li key={it.id} className="card flex items-start gap-4 p-4">
                <span className="rounded-pill bg-walshe-ink/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase text-walshe-grey">
                  {it.kind}
                </span>
                <div className="min-w-0 flex-1">
                  {it.title && <p className="text-small font-semibold text-walshe-ink">{it.title}</p>}
                  {it.kind === "text" ? (
                    <p className="whitespace-pre-wrap text-body text-walshe-ink">{it.text}</p>
                  ) : it.kind === "image" ? (
                    <CatalogThumb imageKey={it.object_key} alt={it.title || "image"} className="mt-1 h-32 w-48 rounded-sm" />
                  ) : (
                    <p className="text-small text-walshe-grey">Video · {it.content_type}</p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Delete item ${it.id}`}
                  className="grid h-8 w-8 flex-none place-items-center rounded-md text-walshe-grey hover:bg-walshe-danger/10 hover:text-walshe-danger"
                  onClick={async () => {
                    await deleteItem(id, it.id);
                    void reload();
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {entry && <ReviewSection entry={entry} onChanged={reload} />}

      <AddItemDialog
        open={addOpen}
        entryId={id}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          void reload();
        }}
      />

      {entry && (
        <EditEntryDialog
          open={editOpen}
          entry={entry}
          templates={templates}
          geo={geo}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void reload();
          }}
        />
      )}

      {entry && (
        <DeleteEntryDialog
          open={deleteOpen}
          entry={entry}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => router.push("/provider/catalog")}
        />
      )}
    </div>
  );
}
// AC29/AC55 — edit an entry via the shared EntryForm: everything the creation form set.
function EditEntryDialog({
  open,
  entry,
  templates,
  geo,
  onClose,
  onSaved,
}: {
  open: boolean;
  entry: Entry;
  templates: ContentTemplates | null;
  geo: GeoData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog title="Edit entry" open={open} onClose={onClose}>
      <EntryForm
        mode="edit"
        catalogId={entry.catalog_id ?? null}
        entry={entry}
        templates={templates}
        geo={geo}
        onDone={onSaved}
        onCancel={onClose}
      />
    </Dialog>
  );
}

// Contract 3 — delete an entry with explicit confirmation (the delete is audited server-side).
function DeleteEntryDialog({
  open,
  entry,
  onClose,
  onDeleted,
}: {
  open: boolean;
  entry: Entry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog title="Delete entry" open={open} onClose={onClose}>
      <p className="text-body text-walshe-ink">
        Delete <strong>{entry.title}</strong> and all its items? This can&rsquo;t be undone.
      </p>
      {error && <p role="alert" className="mt-2 text-small text-walshe-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="btn-primary bg-walshe-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await deleteEntry(entry.id);
              onDeleted();
            } catch {
              setError("Could not delete the entry.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete entry"}
        </button>
      </div>
    </Dialog>
  );
}

// AC52 — the entry's cover photo + controls to replace it (upload or AI-generate).
function CoverSection({ entry, onChanged }: { entry: Entry; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch {
      setError("Could not update the cover (check the file type, or try again).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-8 p-5" aria-label="Cover photo">
      <h2 className="text-h3 text-walshe-ink">Cover photo</h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <CatalogThumb
          imageKey={entry.cover_object_key || entry.asset_keys?.[0]}
          alt={entry.title}
          className="h-32 w-52 flex-none rounded-sm"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block">
            <span className="label">Upload a new cover</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
              disabled={busy}
              aria-label="Upload cover image"
              className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-medium file:text-white"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void run(() => uploadEntryCover(entry.id, f));
              }}
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="label">Or generate one</span>
              <input
                className="field h-11"
                value={prompt}
                placeholder={`${entry.title} — ${entry.destination}`}
                onChange={(e) => setPrompt(e.target.value)}
                aria-label="Cover image prompt"
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  generateEntryCover(entry.id, prompt.trim() || `${entry.title} — ${entry.destination}`),
                )
              }
            >
              {busy ? "Working…" : "AI generate"}
            </button>
          </div>
          {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
        </div>
      </div>
    </section>
  );
}

// AC29 — the entry's type-specific template attributes, shown with the labels/order from the
// backend templates. Only populated fields are listed.
function EntryDetails({ entry, templates }: { entry: Entry; templates: ContentTemplates | null }) {
  const fields = templates?.templates?.[entry.type] ?? [];
  const attributes = (entry.attributes ?? {}) as Record<string, unknown>;
  const rows = fields.filter((f) => {
    const v = attributes[f.key];
    return v !== null && v !== undefined && String(v) !== "";
  });
  if (rows.length === 0) return null;

  return (
    <section className="card mb-8 p-5" aria-label="Details">
      <h2 className="text-h3 text-walshe-ink">Details</h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map((f) => (
          <div key={f.key} className="flex justify-between gap-4 border-b border-walshe-line/60 py-1.5">
            <dt className="text-small text-walshe-grey">{f.label}</dt>
            <dd className="text-small font-medium text-walshe-ink">{formatAttributeValue(attributes[f.key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Brand-safe flag + send-back-with-reason (AC34/35) — the entry's review controls.
function ReviewSection({ entry, onChanged }: { entry: Entry; onChanged: () => Promise<void> }) {
  const [brandSafe, setBrandSafe] = useState(entry.brand_safe);
  const [visibility, setVisibility] = useState(entry.visibility);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <section className="card space-y-4 p-5" aria-label="Review">
      <h2 className="text-h3 text-walshe-ink">Review</h2>
      {entry.review_reason && (
        <div data-testid="review-reason" className="rounded-sm border border-walshe-warn/40 bg-walshe-warn/10 p-3">
          <p className="text-small font-semibold text-walshe-ink">Sent back for changes</p>
          <p className="mt-1 text-small text-walshe-grey">{entry.review_reason}</p>
        </div>
      )}
      {/* AC54 — move the entry between the Draft / Public / Private sets. */}
      <div className="block">
        <span className="label">Visibility</span>
        <Select
          aria-label="Visibility"
          value={visibility}
          onChange={(v) => setVisibility(v as Entry["visibility"])}
          options={[
            { value: "draft", label: "Draft — hidden from agents" },
            { value: "public", label: "Public — every agent" },
            { value: "private", label: "Private — invited agents only" },
          ]}
        />
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={brandSafe} onChange={(e) => setBrandSafe(e.target.checked)} className="accent-walshe-teal" />
        <span>
          <span className="font-semibold text-walshe-ink">Mark as brand-safe</span>
          <span className="block text-small text-walshe-grey">Verified for the trade.</span>
        </span>
      </label>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await setAccess(entry.id, { brand_safe: brandSafe, visibility });
          await onChanged();
          setBusy(false);
        }}
      >
        Save
      </button>

      <div className="border-t border-walshe-line pt-4">
        <label className="block">
          <span className="label">Reason to send back</span>
          <textarea
            className="field-area w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="Reason to send back"
          />
        </label>
        <button
          type="button"
          className="btn-secondary mt-2"
          disabled={busy || !reason.trim()}
          onClick={async () => {
            setBusy(true);
            await sendBackEntry(entry.id, reason.trim());
            setReason("");
            await onChanged();
            setBusy(false);
          }}
        >
          Send back for changes
        </button>
      </div>
    </section>
  );
}

function AddItemDialog({
  open,
  entryId,
  onClose,
  onAdded,
}: {
  open: boolean;
  entryId: number;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [kind, setKind] = useState<"text" | "media">("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (kind === "text") {
        if (!text.trim()) return;
        await addTextItem(entryId, { text: text.trim(), title: title.trim() });
      } else {
        if (!file) return;
        await uploadMediaItem(entryId, file, title.trim());
      }
      setTitle("");
      setText("");
      setFile(null);
      onAdded();
    } catch {
      setError("Could not add the item (check the file type/size).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Add item" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2" role="tablist" aria-label="Item kind">
          {(["text", "media"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-lg px-4 py-1.5 text-small font-semibold capitalize ${
                kind === k ? "bg-walshe-teal text-white" : "bg-walshe-ink/10 text-walshe-grey"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="label">Title (optional)</span>
          <input className="field h-11" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Item title" />
        </label>
        {kind === "text" ? (
          <label className="block">
            <span className="label">Text</span>
            <textarea className="field-area w-full" value={text} onChange={(e) => setText(e.target.value)} aria-label="Item text" />
          </label>
        ) : (
          <label className="block">
            <span className="label">Image or video file</span>
            <input
              type="file"
              accept="image/*,video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              aria-label="Item file"
              className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-medium file:text-white"
            />
          </label>
        )}
        {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add item"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

