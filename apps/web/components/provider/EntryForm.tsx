"use client";

import { useState, type FormEvent } from "react";
import CollapsibleSection from "../ui/CollapsibleSection";
import Select from "../ui/Select";
import {
  createEntry,
  generateEntryCover,
  setAccess,
  updateEntry,
  uploadEntryCover,
  type CatalogType,
  type ContentTemplates,
  type Entry,
  type GeoData,
  type Season,
  type TemplateField,
} from "../../lib/api";
import { coerceAttributes, inputType } from "../../lib/entry-attributes";

const TYPES: CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];
type CoverMode = "none" | "upload" | "generate";
type Vis = "draft" | "public" | "private";

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// The single entry form used for both creating and editing an entry (AC29/AC55), so editing
// covers everything creation sets. Sections collapse by default to keep the form clean. The cover
// section only shows on create — on an existing entry the cover is managed on the entry page.
export default function EntryForm({
  mode,
  catalogId,
  entry,
  templates,
  geo,
  onDone,
  onCancel,
}: {
  mode: "create" | "edit";
  catalogId: number | null;
  entry?: Entry;
  templates: ContentTemplates | null;
  geo: GeoData | null;
  onDone: (e: Entry) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<CatalogType>((entry?.type as CatalogType) ?? "event");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [country, setCountry] = useState(entry?.country ?? "");
  const [state, setState] = useState(entry?.state ?? "");
  const [city, setCity] = useState(entry?.city ?? "");
  const [season, setSeason] = useState<string>(entry?.season ?? "");
  const [visibility, setVisibility] = useState<Vis>((entry?.visibility as Vis) ?? "draft");
  const [attrs, setAttrs] = useState<Record<string, string>>(() => {
    const a = (entry?.attributes ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v == null ? "" : String(v)]));
  });
  const [neverExpires, setNeverExpires] = useState(!entry?.expires_at);
  const [expiresAt, setExpiresAt] = useState(
    entry?.expires_at ? entry.expires_at.slice(0, 10) : "",
  );
  const [coverMode, setCoverMode] = useState<CoverMode>("none");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields: TemplateField[] = templates?.templates?.[type] ?? [];
  const countries = geo?.countries ?? [];
  const states = countries.find((c) => c.name === country)?.states ?? [];
  const cities = states.find((s) => s.name === state)?.cities ?? [];
  const destination = [city || state, country].filter(Boolean).join(", ");
  const expiry = neverExpires || !expiresAt ? null : new Date(expiresAt).toISOString();
  const locationSummary = [country, state, city].filter(Boolean).join(" · ") || "Not set";

  function changeType(next: CatalogType) {
    setType(next);
    if (mode === "create") setAttrs({});
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!title.trim() || !country) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        if (catalogId === null) return;
        const created = await createEntry({
          catalog_id: catalogId,
          type,
          title: title.trim(),
          description: "",
          destination: destination || country,
          country,
          state,
          city,
          season: (season || null) as Season | null,
          visibility,
          attributes: coerceAttributes(fields, attrs),
          expires_at: expiry,
        });
        let cover = "";
        if (coverMode === "upload" && coverFile) {
          cover = (await uploadEntryCover(created.id, coverFile)).cover_object_key;
        } else if (coverMode === "generate") {
          const prompt = coverPrompt.trim() || `${title.trim()} — ${destination || country} (${type})`;
          cover = (await generateEntryCover(created.id, prompt)).cover_object_key;
        }
        onDone({ ...created, cover_object_key: cover || created.cover_object_key });
      } else if (entry) {
        await updateEntry(entry.id, {
          type,
          title: title.trim(),
          destination: destination || country || entry.destination,
          country,
          state,
          city,
          season: (season || null) as Season | null,
          attributes: coerceAttributes(fields, attrs),
        });
        const updated = await setAccess(entry.id, { visibility, expires_at: expiry });
        onDone(updated);
      }
    } catch {
      setError("Could not save the entry (check the fields and try again).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="block">
        <span className="label">Type</span>
        <Select
          aria-label="Entry type"
          value={type}
          onChange={(v) => changeType(v as CatalogType)}
          options={TYPES.map((t) => ({ value: t, label: cap(t) }))}
        />
      </div>
      <label className="block">
        <span className="label">Title</span>
        <input className="field h-11" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      </label>
      <div className="block">
        <span className="label">Visibility</span>
        <Select
          aria-label="Visibility"
          value={visibility}
          onChange={(v) => setVisibility(v as Vis)}
          options={[
            { value: "draft", label: "Draft — hidden from agents" },
            { value: "public", label: "Public — every agent" },
            { value: "private", label: "Private — invited agents only" },
          ]}
        />
      </div>

      <CollapsibleSection title="Location & season" summary={locationSummary}>
        <div className="grid grid-cols-2 gap-3">
          <div className="block">
            <span className="label">Country</span>
            <Select aria-label="Country" value={country} placeholder="Select…"
              onChange={(v) => { setCountry(v); setState(""); setCity(""); }}
              options={countries.map((c) => ({ value: c.name, label: c.name }))} />
          </div>
          <div className="block">
            <span className="label">State / region</span>
            <Select aria-label="State or region" value={state} placeholder="Select…" disabled={!country}
              onChange={(v) => { setState(v); setCity(""); }}
              options={states.map((s) => ({ value: s.name, label: s.name }))} />
          </div>
          <div className="block">
            <span className="label">City</span>
            <Select aria-label="City" value={city} placeholder="Select…" disabled={!state}
              onChange={setCity} options={cities.map((c) => ({ value: c, label: c }))} />
          </div>
          <div className="block">
            <span className="label">Season</span>
            <Select aria-label="Season" value={season} placeholder="Any" onChange={setSeason}
              options={(geo?.seasons ?? []).map((s) => ({ value: s.value, label: s.label }))} />
          </div>
        </div>
      </CollapsibleSection>

      {fields.length > 0 && (
        <CollapsibleSection title={`${cap(type)} details`}>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                {f.type === "textarea" ? (
                  <textarea className="field-area w-full" value={attrs[f.key] ?? ""} placeholder={f.help}
                    onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))} aria-label={f.label} />
                ) : (
                  <input type={inputType(f.type)} className="field h-11" value={attrs[f.key] ?? ""} placeholder={f.help}
                    onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))} aria-label={f.label} />
                )}
              </label>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {mode === "create" && (
        <CollapsibleSection title="Cover photo" summary="Optional">
          <div className="flex gap-2" role="tablist" aria-label="Cover photo source">
            {(["none", "upload", "generate"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={coverMode === m}
                onClick={() => setCoverMode(m)}
                className={`rounded-lg px-3 py-1.5 text-small font-semibold capitalize ${
                  coverMode === m ? "bg-walshe-teal text-white" : "bg-walshe-ink/10 text-walshe-grey"
                }`}>
                {m === "none" ? "No cover" : m === "upload" ? "Upload" : "AI generate"}
              </button>
            ))}
          </div>
          {coverMode === "upload" && (
            <label className="block">
              <span className="label">Image file</span>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} aria-label="Cover image file"
                className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-medium file:text-white" />
            </label>
          )}
          {coverMode === "generate" && (
            <label className="block">
              <span className="label">Image prompt</span>
              <input className="field h-11" value={coverPrompt} placeholder="Leave blank to use the title + destination"
                onChange={(e) => setCoverPrompt(e.target.value)} aria-label="Cover image prompt" />
            </label>
          )}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Expiry" summary={neverExpires ? "Never expires" : expiresAt || "Set a date"}>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} className="accent-walshe-teal" />
          <span className="text-small text-walshe-ink">Never expires (lives forever)</span>
        </label>
        {!neverExpires && (
          <div className="flex items-end gap-2">
            <label className="block flex-1">
              <span className="label">Expiry date</span>
              <input type="date" className="field h-11" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Expiry date" />
            </label>
            {type === "event" && attrs.end_date && (
              <button type="button" className="btn-secondary h-11 whitespace-nowrap" onClick={() => setExpiresAt(attrs.end_date)}>
                Use event end date
              </button>
            )}
          </div>
        )}
      </CollapsibleSection>

      {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={busy || (mode === "create" && catalogId === null)}>
          {busy ? "Saving…" : mode === "create" ? "Create entry" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
