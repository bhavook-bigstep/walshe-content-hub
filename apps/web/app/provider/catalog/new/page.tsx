"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import PageHeader from "../../../../components/ui/PageHeader";
import {
  ApiError,
  createEntry,
  getContentTemplates,
  uploadImage,
  type CatalogType,
  type ContentTemplates,
  type Entry,
  type TemplateField,
} from "../../../../lib/api";
import { upsertEntry } from "../../../../lib/provider-store";

const TYPES: readonly CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

function fieldInputType(t: string): string {
  return t === "number" ? "number" : t === "date" ? "date" : t === "url" ? "url" : "text";
}

export default function NewEntryPage() {
  const [templates, setTemplates] = useState<ContentTemplates | null>(null);
  const [type, setType] = useState<CatalogType>("event");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState("");
  const [tags, setTags] = useState("");
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [highlights, setHighlights] = useState<string[]>([""]);
  const [sections, setSections] = useState<{ title: string; body: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Entry | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);

  useEffect(() => {
    getContentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates({ templates: {} }));
  }, []);

  const fields: TemplateField[] = useMemo(
    () => templates?.templates?.[type] ?? [],
    [templates, type],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setImageNote(null);
    try {
      const attributes: Record<string, string | number> = {};
      for (const f of fields) {
        const v = attrs[f.key]?.trim();
        if (v) attributes[f.key] = f.type === "number" ? Number(v) : v;
      }
      const entry = await createEntry({
        type,
        title: title.trim(),
        description: description.trim(),
        destination: destination.trim(),
        market_tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        attributes,
        highlights: highlights.map((h) => h.trim()).filter(Boolean),
        custom_sections: sections
          .filter((s) => s.title.trim())
          .map((s) => ({ title: s.title.trim(), body: s.body.trim() })),
      });
      upsertEntry(entry);
      setCreated(entry);
      if (file) {
        try {
          await uploadImage(entry.id, file);
          setImageNote("Image uploaded.");
        } catch (err) {
          setImageNote(
            `Entry saved, but image upload failed: ${err instanceof ApiError ? err.message : "unknown error"}`,
          );
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the entry.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="New entry" description="Publish structured tourism content." />
        <section className="card space-y-4 p-7" role="status">
          <span className="chip-verified w-fit">Created</span>
          <p className="text-h3 text-walshe-ink">&ldquo;{created.title}&rdquo; has been created.</p>
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New entry"
        description="Structured content AI agents can crawl — fill the template, then add custom sections for anything extra."
      />

      <form onSubmit={onSubmit} className="card space-y-6 p-7">
        {/* Basics */}
        <div className="space-y-5">
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
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="field-area" />
          </label>
          <label className="block">
            <span className="label">Destination</span>
            <input required value={destination} onChange={(e) => setDestination(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="label">Market tags (comma separated)</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="field" placeholder="families, luxury" />
          </label>
        </div>

        {/* Structured template fields for this type */}
        {fields.length > 0 && (
          <fieldset className="space-y-4 border-t border-walshe-line pt-5">
            <legend className="eyebrow mb-1">{type} details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className={f.type === "textarea" ? "block sm:col-span-2" : "block"}>
                  <span className="label">{f.label}</span>
                  {f.type === "textarea" ? (
                    <textarea
                      value={attrs[f.key] ?? ""}
                      onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))}
                      rows={2}
                      className="field-area"
                    />
                  ) : (
                    <input
                      type={fieldInputType(f.type)}
                      value={attrs[f.key] ?? ""}
                      onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))}
                      className="field"
                      placeholder={f.help || undefined}
                    />
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Highlights */}
        <fieldset className="space-y-3 border-t border-walshe-line pt-5">
          <legend className="eyebrow mb-1">Highlights</legend>
          {highlights.map((h, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={h}
                onChange={(e) => setHighlights((hs) => hs.map((x, j) => (j === i ? e.target.value : x)))}
                className="field"
                placeholder="A key selling point"
              />
              <button
                type="button"
                onClick={() => setHighlights((hs) => hs.filter((_, j) => j !== i))}
                className="btn-ghost flex-none"
                aria-label="Remove highlight"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setHighlights((hs) => [...hs, ""])} className="btn-ghost">
            + Add highlight
          </button>
        </fieldset>

        {/* Custom sections */}
        <fieldset className="space-y-3 border-t border-walshe-line pt-5">
          <legend className="eyebrow mb-1">Custom sections</legend>
          <p className="text-small text-walshe-grey">For anything the template doesn’t cover.</p>
          {sections.map((s, i) => (
            <div key={i} className="space-y-2 rounded-md border border-walshe-line p-3">
              <div className="flex gap-2">
                <input
                  value={s.title}
                  onChange={(e) => setSections((ss) => ss.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="field"
                  placeholder="Section title"
                />
                <button
                  type="button"
                  onClick={() => setSections((ss) => ss.filter((_, j) => j !== i))}
                  className="btn-ghost flex-none"
                  aria-label="Remove section"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={s.body}
                onChange={(e) => setSections((ss) => ss.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                rows={2}
                className="field-area"
                placeholder="Section content"
              />
            </div>
          ))}
          <button type="button" onClick={() => setSections((ss) => [...ss, { title: "", body: "" }])} className="btn-ghost">
            + Add custom section
          </button>
        </fieldset>

        {/* Image */}
        <label className="block border-t border-walshe-line pt-5">
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
    </div>
  );
}
