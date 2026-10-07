"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import {
  fetchAssetObjectUrl,
  getBrandKit,
  updateBrandKit,
  uploadBrandLogo,
  type BrandKit,
} from "../../../lib/api";
import { FONTS } from "../../../lib/studio/fonts";

/** A stored logo_url may be an owner-only /assets/ path (needs an authed blob) or an external URL. */
async function resolveLogo(logoUrl: string): Promise<string> {
  if (logoUrl.startsWith("/assets/")) {
    return fetchAssetObjectUrl(logoUrl.replace(/^\/assets\//, ""));
  }
  return logoUrl;
}

// The agent's reusable brand (logo, colours, contact) applied when personalising designs (AC28).
function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export default function BrandKitPage() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logoUrl, setLogoUrl] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#000000");
  const [accentColor, setAccentColor] = useState("#000000");
  const [headingFont, setHeadingFont] = useState("display");
  const [bodyFont, setBodyFont] = useState("sans");
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
      if (kit.logo_url) resolveLogo(kit.logo_url).then(setLogoPreview).catch(() => setLogoPreview(""));
      setPrimaryColor(kit.primary_color);
      setAccentColor(kit.accent_color);
      setHeadingFont(kit.heading_font);
      setBodyFont(kit.body_font);
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

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setLogoBusy(true);
    setFormError(null);
    try {
      const kit = await uploadBrandLogo(file);
      setLogoUrl(kit.logo_url ?? "");
      setLogoPreview(kit.logo_url ? await resolveLogo(kit.logo_url) : "");
      setDone("Logo uploaded.");
    } catch (err) {
      setFormError(messageOf(err));
    } finally {
      setLogoBusy(false);
    }
  }

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
        heading_font: headingFont,
        body_font: bodyFont,
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
          <div className="block">
            <span className="label">Logo</span>
            <div className="mt-1 flex items-center gap-4">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreview} className="h-16 w-16 rounded-lg border border-walshe-line object-contain p-1" alt="Brand logo" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-walshe-line text-walshe-grey">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="btn-secondary cursor-pointer">
                  {logoBusy ? "Uploading…" : logoPreview ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={onLogoFile}
                  />
                </label>
                {logoPreview && (
                  <button type="button" className="text-left text-[12px] text-walshe-grey hover:text-walshe-danger"
                    onClick={() => { setLogoUrl(""); setLogoPreview(""); }}>
                    Remove
                  </button>
                )}
                <span className="text-[11px] text-walshe-grey">PNG, JPEG, WebP, GIF or AVIF · up to 25 MB</span>
              </div>
            </div>
          </div>

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

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="label">Heading font</span>
              <select
                value={headingFont}
                onChange={(e) => setHeadingFont(e.target.value)}
                className="field"
                style={{ fontFamily: FONTS.find((f) => f.key === headingFont)?.value }}
              >
                {FONTS.map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Body font</span>
              <select
                value={bodyFont}
                onChange={(e) => setBodyFont(e.target.value)}
                className="field"
                style={{ fontFamily: FONTS.find((f) => f.key === bodyFont)?.value }}
              >
                {FONTS.map((f) => (
                  <option key={f.key} value={f.key} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </select>
            </label>
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
