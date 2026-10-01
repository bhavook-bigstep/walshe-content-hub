"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import PageHeader from "../../../../components/ui/PageHeader";
import { ApiError, createEntry, uploadImage, type CatalogType, type Entry } from "../../../../lib/api";
import { upsertEntry } from "../../../../lib/provider-store";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

export default function NewEntryPage() {
  const [type, setType] = useState<CatalogType>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Entry | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setImageNote(null);
    try {
      const entry = await createEntry({
        type,
        title: title.trim(),
        description: description.trim(),
        destination: destination.trim(),
        market_tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      upsertEntry(entry);
      setCreated(entry);
      if (file) {
        try {
          await uploadImage(entry.id, file);
          setImageNote("Image uploaded.");
        } catch (err) {
          setImageNote(`Entry saved, but image upload failed: ${err instanceof ApiError ? err.message : "unknown error"}`);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        breadcrumbs={[
          { label: "Home", href: "/provider" },
          { label: "My catalog", href: "/provider/catalog" },
          { label: "New entry" },
        ]}
        title="New entry"
        description="Publish an event, place, opportunity, offer or itinerary."
      />

      {created ? (
        <section className="card space-y-4 p-7" role="status">
          <span className="chip-verified w-fit">Created</span>
          <p className="text-h3 text-walshe-ink">
            &ldquo;{created.title}&rdquo; has been created.
          </p>
          <p className="text-body text-walshe-grey">
            Next, mark it brand-safe and choose who in the trade may use it.
          </p>
          {imageNote && <p className="text-small text-walshe-grey">{imageNote}</p>}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href={`/provider/catalog/${created.id}`} className="btn-primary">
              Set brand-safe flag and access
            </Link>
            <Link href="/provider/catalog" className="btn-secondary">
              Back to catalog
            </Link>
          </div>
        </section>
      ) : (
        <form onSubmit={onSubmit} className="card space-y-5 p-7">
          <label className="block">
            <span className="label">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as CatalogType)} className="field capitalize">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Title</span>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="label">Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="field-area" />
          </label>
          <label className="block">
            <span className="label">Destination</span>
            <input required value={destination} onChange={(e) => setDestination(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="label">Market tags (comma separated)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="field" placeholder="families, luxury" />
          </label>
          <label className="block">
            <span className="label">Image (optional)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-mint file:px-4 file:py-2 file:text-small file:font-medium file:text-walshe-teal hover:file:bg-walshe-deep"
            />
          </label>
          {error && (
            <p role="alert" className="text-small font-medium text-walshe-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3 border-t border-walshe-line pt-5">
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Saving…" : "Create entry"}
            </button>
            <Link href="/provider/catalog" className="btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
