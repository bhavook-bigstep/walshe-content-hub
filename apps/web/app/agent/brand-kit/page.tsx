"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { getBrandKit, updateBrandKit, type BrandKit } from "../../../lib/api";

// The agent's reusable brand (logo, colours, contact) applied when personalising designs (AC28).
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function BrandKitPage() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [accentColor, setAccentColor] = useState("#000000");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const kit = await getBrandKit();
      setLogoUrl(kit.logo_url ?? "");
      setPrimaryColor(kit.primary_color);
      setAccentColor(kit.accent_color);
      setContactName(kit.contact_name ?? "");
      setContactEmail(kit.contact_email ?? "");
      setWebsite(kit.website ?? "");
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDone(null);
    setBusy(true);
    try {
      const body: Partial<BrandKit> = {
        logo_url: logoUrl.trim() || null,
        primary_color: primaryColor,
        accent_color: accentColor,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        website: website.trim() || null,
      };
      await updateBrandKit(body);
      setDone("Brand kit saved.");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Brand kit"
      />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      {!loaded ? (
        <div className="card h-96 animate-pulse bg-walshe-stone/60" aria-hidden />
      ) : (
        <form onSubmit={onSave} className="card p-7 space-y-5" aria-busy={busy}>
          <label className="block">
            <span className="label">Logo URL</span>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
              className="field"
            />
          </label>

          {logoUrl.trim() && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} className="h-14 w-auto rounded-sm" alt="Brand logo" />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <span className="label">Primary colour</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  aria-label="Primary colour"
                  className="h-10 w-12 flex-none cursor-pointer rounded-md border border-walshe-line bg-transparent"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="field"
                />
              </div>
            </div>
            <div>
              <span className="label">Accent colour</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  aria-label="Accent colour"
                  className="h-10 w-12 flex-none cursor-pointer rounded-md border border-walshe-line bg-transparent"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="field"
                />
              </div>
            </div>
          </div>

          <label className="block">
            <span className="label">Contact name</span>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="field"
            />
          </label>

          <label className="block">
            <span className="label">Contact email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="field"
            />
          </label>

          <label className="block">
            <span className="label">Website</span>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              className="field"
            />
          </label>

          {formError && (
            <p role="alert" className="text-small font-medium text-walshe-danger">
              {formError}
            </p>
          )}
          {done && (
            <p role="status" className="text-small font-medium text-walshe-green">
              {done}
            </p>
          )}

          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? "Saving…" : "Save brand kit"}
          </button>
        </form>
      )}
    </div>
  );
}
