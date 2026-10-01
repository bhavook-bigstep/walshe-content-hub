"use client";

import { useState } from "react";
import { applyBranding, type Branding } from "../../lib/studio/branding";
import type { DesignDoc } from "../../lib/studio/ops";

/** Default logo handling: inline data URL so the panel works without a new API. Pass `uploadLogo`
 *  to route the file through the existing agent-scoped assets endpoint and return its served URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read logo."));
    r.readAsDataURL(file);
  });
}

export default function PersonalizePanel({
  design,
  pageIndex,
  onChange,
  uploadLogo = readAsDataUrl,
}: {
  design: DesignDoc;
  pageIndex: number;
  onChange: (next: DesignDoc) => void;
  uploadLogo?: (file: File) => Promise<string>;
}) {
  const [logoSrc, setLogoSrc] = useState<string | undefined>();
  const [contact, setContact] = useState({ name: "", email: "", phone: "", website: "" });
  const [offer, setOffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setLogoSrc(await uploadLogo(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed.");
    }
  }

  function apply() {
    const branding: Branding = {
      logo: logoSrc ? { src: logoSrc } : undefined,
      contact,
      offer: { text: offer },
    };
    onChange(applyBranding(design, branding, pageIndex));
  }

  const input = "field text-small";
  return (
    <section className="flex flex-col gap-4" aria-label="Personalize">
      <p className="text-small text-walshe-grey">Add your branding, then apply it to the current page.</p>
      <div>
        <span className="label">Logo</span>
        <label className="flex cursor-pointer items-center gap-3 rounded-sm border border-dashed border-walshe-stone bg-walshe-mist/50 px-4 py-3 transition-colors hover:border-walshe-ink/25">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-walshe-teal text-walshe-mint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
          </span>
          <span className="min-w-0 text-small text-walshe-grey">{logoSrc ? "Logo added — choose another to replace" : "Upload a logo image"}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => void onLogo(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(["name", "email", "phone", "website"] as const).map((k) => (
          <label key={k} className="block">
            <span className="label">{k[0].toUpperCase() + k.slice(1)}</span>
            <input
              className={input}
              placeholder={k[0].toUpperCase() + k.slice(1)}
              aria-label={`Contact ${k}`}
              value={contact[k]}
              onChange={(e) => setContact({ ...contact, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="label">Custom offer</span>
        <textarea
          className="field-area text-small"
          placeholder="Custom offer"
          aria-label="Custom offer"
          rows={2}
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
        />
      </label>
      <button type="button" className="btn-primary self-start" onClick={apply}>
        Apply to page
      </button>
      {error && <p role="alert" className="text-small text-walshe-danger">{error}</p>}
    </section>
  );
}
