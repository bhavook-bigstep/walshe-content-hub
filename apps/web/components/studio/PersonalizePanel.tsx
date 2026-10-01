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

  const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm";
  return (
    <section className="flex flex-col gap-2" aria-label="Personalize">
      <label className="text-sm">
        Logo
        <input type="file" accept="image/*" onChange={(e) => void onLogo(e.target.files?.[0])} />
      </label>
      {(["name", "email", "phone", "website"] as const).map((k) => (
        <input
          key={k}
          className={input}
          placeholder={k[0].toUpperCase() + k.slice(1)}
          aria-label={`Contact ${k}`}
          value={contact[k]}
          onChange={(e) => setContact({ ...contact, [k]: e.target.value })}
        />
      ))}
      <textarea
        className={input}
        placeholder="Custom offer"
        aria-label="Custom offer"
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
      />
      <button type="button" className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100" onClick={apply}>
        Apply to page
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
