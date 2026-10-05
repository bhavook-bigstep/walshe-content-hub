"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import CatalogThumb from "../../../components/catalog/CatalogThumb";
import Dialog from "../../../components/ui/Dialog";
import PageHeader from "../../../components/ui/PageHeader";
import Select from "../../../components/ui/Select";
import {
  createEntry,
  generateEntryCover,
  getContentTemplates,
  getGeo,
  getMyCatalog,
  inviteAgent,
  listMyEntries,
  uninviteAgent,
  uploadEntryCover,
  ApiError,
  type Catalog,
  type CatalogType,
  type ContentTemplates,
  type Entry,
  type GeoData,
  type Season,
  type TemplateField,
} from "../../../lib/api";
import { coerceAttributes, inputType } from "../../../lib/entry-attributes";

const TYPES: CatalogType[] = ["event", "place", "opportunity", "offer", "itinerary"];

// AC54 — the three per-entry sets, shown as a badge so a provider sees each entry's reach.
const VISIBILITY_STYLES: Record<string, string> = {
  public: "bg-walshe-teal text-white",
  private: "bg-walshe-warn/90 text-walshe-ink",
  draft: "bg-walshe-ink/70 text-white",
};
function VisibilityBadge({ visibility, className = "" }: { visibility?: string; className?: string }) {
  const v = visibility ?? "draft";
  return (
    <span className={`rounded-pill px-2.5 py-0.5 text-[11px] font-semibold capitalize ${VISIBILITY_STYLES[v] ?? VISIBILITY_STYLES.draft} ${className}`}>
      {v}
    </span>
  );
}

// AC54 — invite agents by email to the catalog's private entries, in a dialog opened from the page.
function InviteAgentsDialog({
  open,
  catalog,
  onClose,
  onChange,
}: {
  open: boolean;
  catalog: Catalog;
  onClose: () => void;
  onChange: (c: Catalog) => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invited = catalog.invited_agents ?? [];

  async function add(ev: FormEvent) {
    ev.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await inviteAgent(email.trim()));
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not invite that agent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Invite agents" open={open} onClose={onClose}>
      <p className="text-small text-walshe-grey">
        Invite agents by email to see this catalog&rsquo;s <strong>private</strong> entries. Public
        entries are visible to everyone; drafts to no one.
      </p>
      <form onSubmit={add} className="mt-4 flex items-end gap-2">
        <label className="flex-1">
          <span className="label">Agent email</span>
          <input
            type="email"
            className="field h-11 w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@example.com"
            aria-label="Agent email"
          />
        </label>
        <button type="submit" className="btn-primary h-11" disabled={busy || !email.trim()}>
          {busy ? "Inviting…" : "Invite"}
        </button>
      </form>
      {error && <p role="alert" className="mt-2 text-small text-walshe-danger">{error}</p>}
      <div className="mt-5">
        <p className="label">Invited ({invited.length})</p>
        {invited.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Invited agent list">
            {invited.map((a) => (
              <li key={a.id} className="inline-flex items-center gap-2 rounded-pill bg-walshe-stone px-3 py-1 text-small text-walshe-ink">
                {a.email}
                <button
                  type="button"
                  aria-label={`Remove ${a.email}`}
                  onClick={async () => onChange(await uninviteAgent(a.id))}
                  className="text-walshe-grey hover:text-walshe-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-small text-walshe-grey">No agents invited yet.</p>
        )}
      </div>
    </Dialog>
  );
}

// AC54 — one of the three catalog sets (Public / Private / Drafts) as a titled grid of cards.
function EntrySection({ title, blurb, entries }: { title: string; blurb: string; entries: Entry[] }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-h3 text-walshe-ink">{title}</h2>
        <span className="text-small text-walshe-grey">{entries.length} · {blurb}</span>
      </div>
      {entries.length === 0 ? (
        <p className="card p-6 text-small text-walshe-grey">Nothing here yet.</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/provider/catalog/${e.id}`} className="card card-hover group block overflow-hidden">
                <div className="relative">
                  <CatalogThumb imageKey={e.cover_object_key || e.asset_keys?.[0]} alt={e.title} className="h-40 w-full transition-transform duration-500 group-hover:scale-105" />
                  <VisibilityBadge visibility={e.visibility} className="absolute left-3 top-3" />
                </div>
                <div className="space-y-1.5 p-5">
                  <h3 className="truncate text-h3 text-[1.0625rem] text-walshe-ink">{e.title}</h3>
                  <p className="text-small capitalize text-walshe-grey">{e.type} · {e.destination}</p>
                  <p className="text-[12px] text-walshe-grey">{e.items?.length ?? 0} items</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// AC49/AC50 — the provider's single catalog: publish/share it, and manage its entries.
export default function ProviderCatalogPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [templates, setTemplates] = useState<ContentTemplates | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  async function reload() {
    setCatalog(await getMyCatalog().catch(() => null));
    setEntries(await listMyEntries().catch(() => []));
  }
  useEffect(() => {
    void reload();
    void getContentTemplates()
      .then(setTemplates)
      .catch(() => setTemplates(null));
    void getGeo()
      .then(setGeo)
      .catch(() => setGeo(null));
  }, []);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Home", href: "/provider" }, { label: "Catalog" }]}
        title="Catalog"
        description="Each entry is Draft (hidden), Public (every agent), or Private (invited agents only)."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setInviteOpen(true)}
              disabled={!catalog}
            >
              Invite agents{catalog?.invited_agents?.length ? ` (${catalog.invited_agents.length})` : ""}
            </button>
            <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
              New entry
            </button>
          </div>
        }
      />

      {entries === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-56 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="card flex flex-col items-start gap-3 p-10 text-center sm:items-center">
          <h3 className="text-h3 text-walshe-ink">No entries yet</h3>
          <p className="max-w-md text-body text-walshe-grey">
            Add your first event, place, offer or itinerary, then open it to add text + media items.
          </p>
          <button type="button" className="btn-primary mt-1" onClick={() => setDialogOpen(true)}>
            New entry
          </button>
        </div>
      ) : (
        <div className="space-y-10">
          <EntrySection
            title="Public"
            blurb="Visible to every agent."
            entries={entries.filter((e) => e.visibility === "public")}
          />
          <EntrySection
            title="Private"
            blurb="Visible only to invited agents."
            entries={entries.filter((e) => e.visibility === "private")}
          />
          <EntrySection
            title="Drafts"
            blurb="Hidden from agents until you publish them."
            entries={entries.filter((e) => e.visibility === "draft")}
          />
        </div>
      )}

      <NewEntryDialog
        open={dialogOpen}
        catalogId={catalog?.id ?? null}
        templates={templates}
        geo={geo}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setDialogOpen(false);
          void reload();
        }}
      />

      {catalog && (
        <InviteAgentsDialog
          open={inviteOpen}
          catalog={catalog}
          onClose={() => setInviteOpen(false)}
          onChange={setCatalog}
        />
      )}
    </div>
  );
}

type CoverMode = "none" | "upload" | "generate";

function NewEntryDialog({
  open,
  catalogId,
  templates,
  geo,
  onClose,
  onCreated,
}: {
  open: boolean;
  catalogId: number | null;
  templates: ContentTemplates | null;
  geo: GeoData | null;
  onClose: () => void;
  onCreated: (e: Entry) => void;
}) {
  const [type, setType] = useState<CatalogType>("event");
  const [title, setTitle] = useState("");
  // Structured location (AC53): cascading country → state → city, composed into `destination`.
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [season, setSeason] = useState("");
  // AC54 — new entries default to draft; the provider chooses public/private here.
  const [visibility, setVisibility] = useState<"draft" | "public" | "private">("draft");
  const [validFrom, setValidFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  // Type-specific attribute values, keyed by field key. Reset whenever the type changes so the
  // form never carries one type's answers into another's template.
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  // Cover photo (AC52): none, an uploaded file, or an AI-generated image from a prompt.
  const [coverMode, setCoverMode] = useState<CoverMode>("none");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPrompt, setCoverPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The selected type's structured fields come from the backend templates (single source of
  // truth, AC29); no key or an unreachable API just yields an empty detail section.
  const fields: TemplateField[] = templates?.templates?.[type] ?? [];

  const countries = geo?.countries ?? [];
  const states = countries.find((c) => c.name === country)?.states ?? [];
  const cities = states.find((s) => s.name === state)?.cities ?? [];
  // The human label stored on the entry (also what older UI/search reads).
  const destination = [city || state, country].filter(Boolean).join(", ");

  function changeType(next: CatalogType) {
    setType(next);
    setAttrs({});
  }

  function reset() {
    setType("event");
    setTitle("");
    setCountry("");
    setState("");
    setCity("");
    setSeason("");
    setVisibility("draft");
    setValidFrom("");
    setExpiresAt("");
    setAttrs({});
    setCoverMode("none");
    setCoverFile(null);
    setCoverPrompt("");
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!title.trim() || !country || catalogId === null) return;
    setBusy(true);
    setError(null);
    try {
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
        valid_from: validFrom ? new Date(validFrom).toISOString() : null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      // Second phase: attach the chosen cover to the new entry, then reflect it locally so the
      // card shows it immediately. A cover failure doesn't lose the entry — surface it and stop.
      let cover = "";
      if (coverMode === "upload" && coverFile) {
        cover = (await uploadEntryCover(created.id, coverFile)).cover_object_key;
      } else if (coverMode === "generate") {
        const prompt = coverPrompt.trim() || `${title.trim()} — ${destination || country} (${type})`;
        cover = (await generateEntryCover(created.id, prompt)).cover_object_key;
      }
      reset();
      onCreated({ ...created, cover_object_key: cover || created.cover_object_key });
    } catch {
      setError("Could not create the entry (check the dates, cover file type, or try again).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="New entry" open={open} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="block">
          <span className="label">Type</span>
          <Select
            aria-label="Entry type"
            value={type}
            onChange={(v) => changeType(v as CatalogType)}
            options={TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
          />
        </div>
        <label className="block">
          <span className="label">Title</span>
          <input className="field h-11" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
        </label>

        {/* AC54 — which set the entry goes in. Default draft; provider picks public/private. */}
        <div className="block">
          <span className="label">Visibility</span>
          <Select
            aria-label="Visibility"
            value={visibility}
            onChange={(v) => setVisibility(v as "draft" | "public" | "private")}
            options={[
              { value: "draft", label: "Draft — hidden from agents" },
              { value: "public", label: "Public — every agent" },
              { value: "private", label: "Private — invited agents only" },
            ]}
          />
        </div>

        {/* AC53 — structured location: cascading country → state → city, plus season. */}
        <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-walshe-line p-3">
          <legend className="px-1 text-small font-semibold text-walshe-grey">Location &amp; season</legend>
          <div className="block">
            <span className="label">Country</span>
            <Select
              aria-label="Country"
              value={country}
              placeholder="Select…"
              onChange={(v) => { setCountry(v); setState(""); setCity(""); }}
              options={countries.map((c) => ({ value: c.name, label: c.name }))}
            />
          </div>
          <div className="block">
            <span className="label">State / region</span>
            <Select
              aria-label="State or region"
              value={state}
              placeholder="Select…"
              disabled={!country}
              onChange={(v) => { setState(v); setCity(""); }}
              options={states.map((s) => ({ value: s.name, label: s.name }))}
            />
          </div>
          <div className="block">
            <span className="label">City</span>
            <Select
              aria-label="City"
              value={city}
              placeholder="Select…"
              disabled={!state}
              onChange={setCity}
              options={cities.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div className="block">
            <span className="label">Season</span>
            <Select
              aria-label="Season"
              value={season}
              placeholder="Any"
              onChange={setSeason}
              options={(geo?.seasons ?? []).map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
        </fieldset>

        {/* AC29 — the detail fields change with the selected type's template. */}
        {fields.length > 0 && (
          <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-walshe-line p-3">
            <legend className="px-1 text-small font-semibold capitalize text-walshe-grey">{type} details</legend>
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="label">{f.label}</span>
                {f.type === "textarea" ? (
                  <textarea
                    className="field-area w-full"
                    value={attrs[f.key] ?? ""}
                    placeholder={f.help}
                    onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))}
                    aria-label={f.label}
                  />
                ) : (
                  <input
                    type={inputType(f.type)}
                    className="field h-11"
                    value={attrs[f.key] ?? ""}
                    placeholder={f.help}
                    onChange={(e) => setAttrs((a) => ({ ...a, [f.key]: e.target.value }))}
                    aria-label={f.label}
                  />
                )}
              </label>
            ))}
          </fieldset>
        )}

        {/* AC52 — the card cover photo: none, upload, or AI-generate. */}
        <fieldset className="space-y-3 rounded-lg border border-walshe-line p-3">
          <legend className="px-1 text-small font-semibold text-walshe-grey">Cover photo</legend>
          <div className="flex gap-2" role="tablist" aria-label="Cover photo source">
            {(["none", "upload", "generate"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={coverMode === m}
                onClick={() => setCoverMode(m)}
                className={`rounded-lg px-3 py-1.5 text-small font-semibold capitalize ${
                  coverMode === m ? "bg-walshe-teal text-white" : "bg-walshe-ink/10 text-walshe-grey"
                }`}
              >
                {m === "none" ? "No cover" : m === "upload" ? "Upload" : "AI generate"}
              </button>
            ))}
          </div>
          {coverMode === "upload" && (
            <label className="block">
              <span className="label">Image file</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
                aria-label="Cover image file"
                className="block w-full text-small text-walshe-grey file:mr-3 file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-medium file:text-white"
              />
            </label>
          )}
          {coverMode === "generate" && (
            <label className="block">
              <span className="label">Image prompt</span>
              <input
                className="field h-11"
                value={coverPrompt}
                placeholder="Leave blank to use the title + destination"
                onChange={(e) => setCoverPrompt(e.target.value)}
                aria-label="Cover image prompt"
              />
              <span className="mt-1 block text-[12px] text-walshe-grey">Generated with the configured image model (Gemini nano-banana-2).</span>
            </label>
          )}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Valid from</span>
            <input type="date" className="field h-11" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} aria-label="Valid from" />
          </label>
          <label className="block">
            <span className="label">Expires at</span>
            <input type="date" className="field h-11" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} aria-label="Expires at" />
          </label>
        </div>
        {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || catalogId === null}>
            {busy ? "Creating…" : "Create entry"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
