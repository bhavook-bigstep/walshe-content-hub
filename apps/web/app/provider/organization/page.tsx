"use client";

import { useEffect, useState, type FormEvent } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import {
  ApiError,
  getOrganization,
  updateOrganization,
  type Organization,
  type OrganizationUpdateInput,
} from "../../../lib/api";

export default function ProviderOrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [marketsText, setMarketsText] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function hydrate(o: Organization) {
    setOrg(o);
    setName(o.name);
    setBlurb(o.blurb ?? "");
    setLogoUrl(o.logo_url ?? "");
    setMarketsText(o.markets.join(", "));
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const o = await getOrganization();
        if (!active) return;
        hydrate(o);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load your organization. Please try again.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const markets = marketsText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);

    const body: OrganizationUpdateInput = {
      name,
      blurb,
      logo_url: logoUrl,
      markets,
    };

    try {
      const updated = await updateOrganization(body);
      hydrate(updated);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save your organization. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title="Organization"
        description="Your public profile shown with your verified content."
      />

      {loading ? (
        <div className="card p-6">
          <p className="text-body text-walshe-grey">Loading…</p>
        </div>
      ) : notFound ? (
        <div className="card p-8 text-center text-walshe-grey">
          No organization linked to this account.
        </div>
      ) : loadError ? (
        <div className="card p-6">
          <p role="alert" className="text-small font-medium text-walshe-danger">
            {loadError}
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="card space-y-5 p-6" aria-busy={saving}>
          {org && (
            <div>
              {org.verified ? (
                <span className="chip-verified">Verified board</span>
              ) : (
                <span className="chip-draft">Pending verification</span>
              )}
            </div>
          )}

          <label className="block">
            <span className="label">Organization name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
            />
          </label>

          <label className="block">
            <span className="label">Blurb</span>
            <textarea
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              className="field-area"
            />
          </label>

          <label className="block">
            <span className="label">Logo URL</span>
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="field"
            />
          </label>

          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} className="h-16 w-auto rounded-sm" alt="Organization logo" />
          )}

          <label className="block">
            <span className="label">Markets</span>
            <input
              type="text"
              value={marketsText}
              onChange={(e) => setMarketsText(e.target.value)}
              className="field"
              placeholder="Australia, New Zealand, Fiji"
            />
          </label>

          {error && (
            <p role="alert" className="text-small font-medium text-walshe-danger">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-small font-medium text-walshe-green">
              Profile saved.
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}
