"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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

  const input = "mt-1 block w-full rounded border border-slate-300 px-3 py-2";

  return (
    <main className="max-w-xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">New entry</h1>
        <Link href="/provider/catalog" className="text-sm underline">
          My catalog
        </Link>
      </div>

      {created ? (
        <section className="space-y-2 rounded-lg bg-white p-4 shadow" role="status">
          <p className="text-sm">Created &quot;{created.title}&quot;.</p>
          {imageNote && <p className="text-sm text-slate-600">{imageNote}</p>}
          <Link href={`/provider/catalog/${created.id}`} className="text-sm underline">
            Set brand-safe flag and access
          </Link>
        </section>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as CatalogType)} className={input}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </label>
          <label className="block text-sm">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={input} />
          </label>
          <label className="block text-sm">
            Destination
            <input required value={destination} onChange={(e) => setDestination(e.target.value)} className={input} />
          </label>
          <label className="block text-sm">
            Market tags (comma separated)
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={input} />
          </label>
          <label className="block text-sm">
            Image (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-60">
            {busy ? "Saving..." : "Create entry"}
          </button>
        </form>
      )}
    </main>
  );
}
