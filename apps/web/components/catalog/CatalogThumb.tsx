"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAssetObjectUrl } from "../../lib/api";

// Derive a stable picsum seed from the entry title so the editorial fallback image is consistent
// across renders (same title → same photo), never a flat grey box.
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "walshe-catalog"
  );
}

// Image-first catalog thumbnail (brief §4 catalog, "vita" direction — photo-led, 4/3, rounded).
// Fetches the approved asset through the authed client; when there is no image (or the fetch fails)
// it shows an editorial picsum photo over a brand gradient, so a card is always photo-led.
export default function CatalogThumb({
  imageKey,
  alt,
  className = "aspect-[4/3] w-full",
}: {
  imageKey?: string | null;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const fallback = useMemo(() => `https://picsum.photos/seed/${slugify(alt)}/700/560`, [alt]);

  useEffect(() => {
    if (!imageKey) return;
    let url: string | null = null;
    let cancelled = false;
    fetchAssetObjectUrl(imageKey)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else {
          url = u;
          setSrc(u);
        }
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageKey]);

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-walshe-teal-100 to-walshe-mint ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src ?? fallback}
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}
