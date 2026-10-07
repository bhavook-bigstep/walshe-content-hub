"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  fetchAssetObjectUrl,
  getMyCatalog,
  getOrganization,
  inviteAgent,
  inviteMember,
  listTeam,
  uninviteAgent,
  updateOrganization,
  uploadOrgLogo,
  type Catalog,
  type Organization,
  type OrganizationUpdateInput,
  type TeamMember,
} from "../../../lib/api";

export default function ProviderOrganizationPage() {
  return (
    <div className="space-y-6">
      {/* Profile (the main form) leads on the left; invites + team stack on the right. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <OrgProfileCard />
        <div className="space-y-6">
          <InviteAgentsCard />
          <TeamCard />
        </div>
      </div>
    </div>
  );
}

// --- Org profile + logo upload (AC27/AC58) -------------------------------------------------------
function OrgProfileCard() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [status, setStatus] = useState<"loading" | "notfound" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [marketsText, setMarketsText] = useState("");
  const [logoSrc, setLogoSrc] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hydrate(o: Organization) {
    setOrg(o);
    setName(o.name);
    setBlurb(o.blurb ?? "");
    setMarketsText(o.markets.join(", "));
  }

  useEffect(() => {
    getOrganization()
      .then((o) => { hydrate(o); setStatus("ready"); })
      .catch((err) => setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error"));
  }, []);

  // Resolve the stored logo (an /assets key needs an authed fetch; an external URL is used as-is).
  useEffect(() => {
    const url = org?.logo_url;
    if (!url) { setLogoSrc(""); return; }
    if (url.startsWith("http")) { setLogoSrc(url); return; }
    let blob = "";
    fetchAssetObjectUrl(url.replace(/^\/assets\//, ""))
      .then((b) => { blob = b; setLogoSrc(b); })
      .catch(() => setLogoSrc(""));
    return () => { if (blob) URL.revokeObjectURL(blob); };
  }, [org?.logo_url]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const markets = marketsText.split(",").map((m) => m.trim()).filter(Boolean);
    const body: OrganizationUpdateInput = { name, blurb, markets };
    try {
      hydrate(await updateOrganization(body));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your organization.");
    } finally {
      setSaving(false);
    }
  }

  async function onLogo(file: File) {
    setError(null);
    try {
      hydrate(await uploadOrgLogo(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload the logo (jpg/jpeg/png).");
    }
  }

  if (status === "loading") return <div className="card h-64 animate-pulse bg-walshe-stone/60" aria-hidden />;
  if (status === "notfound")
    return <div className="card p-8 text-center text-walshe-grey">No organization linked to this account.</div>;
  if (status === "error")
    return <div className="card p-6"><p role="alert" className="text-small text-walshe-danger">Could not load your organization.</p></div>;

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6 sm:p-7" aria-label="Organization profile" aria-busy={saving}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h3 text-walshe-ink">Board profile</h2>
          <p className="mt-1 text-small text-walshe-grey">How agents see your organization across the hub.</p>
        </div>
        {org && (
          org.verified
            ? <span className="chip-verified shrink-0">Verified board</span>
            : <span className="chip-draft shrink-0">Pending verification</span>
        )}
      </div>

      {/* Logo */}
      <div className="flex items-center gap-5 rounded-md border border-walshe-line bg-walshe-mist/50 p-4">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} className="h-20 w-20 flex-none rounded-md object-cover" alt="Organization logo" />
        ) : (
          <div className="grid h-20 w-20 flex-none place-items-center rounded-md border border-dashed border-walshe-line bg-walshe-stone text-[11px] font-medium text-walshe-grey">
            Logo
          </div>
        )}
        <div className="min-w-0">
          <span className="label">Logo</span>
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Upload organization logo"
            className="mt-1 block w-full text-small text-walshe-grey file:mr-3 file:cursor-pointer file:rounded-pill file:border-0 file:bg-walshe-teal file:px-4 file:py-2 file:text-small file:font-semibold file:text-white"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLogo(f); }}
          />
          <p className="mt-1.5 text-[12px] text-walshe-grey">JPG or PNG — a square image reads best.</p>
        </div>
      </div>

      <label className="block">
        <span className="label">Organization name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="field" />
      </label>
      <label className="block">
        <span className="label">Blurb</span>
        <textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} className="field-area" rows={3} />
      </label>
      <label className="block">
        <span className="label">Markets</span>
        <input type="text" value={marketsText} onChange={(e) => setMarketsText(e.target.value)} className="field" placeholder="Australia, New Zealand, Fiji" />
        <span className="mt-1.5 block text-[12px] text-walshe-grey">Comma-separated — the destinations you represent.</span>
      </label>

      <div className="flex items-center gap-4 border-t border-walshe-line pt-5">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        {error && <p role="alert" className="text-small font-medium text-walshe-danger">{error}</p>}
        {saved && <p role="status" className="text-small font-medium text-walshe-green">Profile saved.</p>}
      </div>
    </form>
  );
}

// --- Invite agents to private content (AC54) -----------------------------------------------------
function InviteAgentsCard() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMyCatalog().then(setCatalog).catch(() => setCatalog(null)); }, []);
  const invited = catalog?.invited_agents ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setCatalog(await inviteAgent(email.trim()));
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not invite that agent.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, label: string) {
    setError(null);
    try {
      setCatalog(await uninviteAgent(id));
    } catch {
      setError(`Could not remove ${label}.`);
    }
  }

  return (
    <section className="card p-6" aria-label="Invited agents">
      <h2 className="text-h3 text-walshe-ink">Invited agents</h2>
      <p className="mt-1 text-small text-walshe-grey">
        Invite agents by email to see your catalog&rsquo;s <strong>private</strong> entries.
      </p>
      <form onSubmit={add} className="mt-4 flex items-end gap-2">
        <label className="flex-1">
          <span className="label">Agent email</span>
          <input type="email" className="field h-11 w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@example.com" aria-label="Agent email" />
        </label>
        <button type="submit" className="btn-primary h-11" disabled={busy || !email.trim()}>{busy ? "Inviting…" : "Invite"}</button>
      </form>
      {error && <p role="alert" className="mt-2 text-small text-walshe-danger">{error}</p>}
      {invited.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Invited agent list">
          {invited.map((a) => (
            <li key={a.id} className="inline-flex items-center gap-2 rounded-pill bg-walshe-stone py-1 pl-3 pr-1.5 text-small text-walshe-ink">
              {a.email}
              <button
                type="button"
                aria-label={`Remove ${a.email}`}
                onClick={() => void remove(a.id, a.email)}
                className="grid h-5 w-5 place-items-center rounded-full text-walshe-grey transition-colors hover:bg-walshe-danger/15 hover:text-walshe-danger"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-walshe-line px-4 py-3 text-small text-walshe-grey">
          No agents invited yet.
        </p>
      )}
    </section>
  );
}

// --- Team (colleagues on the same org) -----------------------------------------------------------
function TeamCard() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() { listTeam().then(setTeam).catch(() => setTeam([])); }
  useEffect(() => { load(); }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 8) return;
    setBusy(true);
    setError(null);
    try {
      await inviteMember({ email: email.trim(), password, display_name: displayName.trim() || undefined });
      setEmail(""); setDisplayName(""); setPassword("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not invite that colleague.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6" aria-label="Team">
      <h2 className="text-h3 text-walshe-ink">Team</h2>
      <p className="mt-1 text-small text-walshe-grey">Colleagues who manage this organization&rsquo;s content.</p>

      {team === null ? (
        <p className="mt-3 text-small text-walshe-grey">Loading…</p>
      ) : team.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-walshe-line px-4 py-3 text-small text-walshe-grey">
          No colleagues yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Team members">
          {team.map((m) => (
            <li key={m.id} className="flex items-center gap-3 rounded-md border border-walshe-line/70 p-2.5">
              <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-walshe-teal/10 text-small font-bold text-walshe-teal">
                {(m.display_name || m.email).trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium text-walshe-ink">{m.display_name || m.email}</span>
                <span className="block truncate text-[12px] text-walshe-grey">{m.email}</span>
              </span>
              <span className={m.approved ? "chip-verified shrink-0" : "chip-draft shrink-0"}>{m.approved ? "Active" : "Pending"}</span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={invite} className="mt-5 space-y-3 border-t border-walshe-line pt-5">
        <p className="label">Invite a colleague</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input type="email" className="field h-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Colleague email" />
          <input type="text" className="field h-11" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name (optional)" aria-label="Colleague name" />
        </div>
        <input type="password" className="field h-11" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temporary password (min 8 chars)" aria-label="Temporary password" />
        {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
        <button type="submit" className="btn-secondary" disabled={busy || !email.trim() || password.length < 8}>{busy ? "Inviting…" : "Invite colleague"}</button>
      </form>
    </section>
  );
}
