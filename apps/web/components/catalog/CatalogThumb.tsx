"use client";

import { useEffect, useState } from "react";
import { fetchAssetObjectUrl } from "../../lib/api";

// Image-first catalog thumbnail (brief §4 catalog). Fetches the approved asset through the authed
// client; falls back to a brand gradient placeholder when there is no image or the fetch fails.
export default function CatalogThumb({
  imageKey,
  alt,
  className = "h-40 w-full",
}: {
  imageKey?: string | null;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
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

  if (!src) {
    return (
      <div
        aria-hidden
        className={`${className} rounded-sm bg-gradient-to-br from-walshe-teal-100 to-walshe-mint`}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={`${className} rounded-sm object-cover`} />;
}
