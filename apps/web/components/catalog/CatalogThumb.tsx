"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAssetObjectUrl } from "../../lib/api";

// Curated Picsum photo IDs that are genuine scenic landscapes (mountains, coast, forest, desert),
// so a catalog entry without a real asset still shows destination-quality imagery — never a random
// stock photo. A stable hash of the title picks one (same title → same photo).
const LANDSCAPES = [1018, 1015, 1016, 1036, 1039, 1041, 1043, 1044, 1047, 1057, 1061, 29, 28, 110];
function pickLandscape(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return LANDSCAPES[h % LANDSCAPES.length];
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
  const fallback = useMemo(() => `https://picsum.photos/id/${pickLandscape(alt)}/700/560`, [alt]);

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
