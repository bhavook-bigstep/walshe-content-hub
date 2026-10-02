"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { listMedia, ApiError, type MediaItem } from "../../../lib/api";

// Provider media library (AC29): every image/asset across the provider's catalog entries.
function messageOf(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

function FileIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

export default function ProviderMediaPage() {
  const [media, setMedia] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMedia(await listMedia());
    } catch (e) {
      setMedia([]);
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loading = media === null;

  return (
    <div>
      <PageHeader
        title="Media library"
        description="Every image and asset across your catalog, in one place."
      />

      {error ? (
        <div role="alert" className="card border-walshe-danger/30 p-8 text-center text-walshe-danger">
          {error}
        </div>
      ) : loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-40 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="card p-8 text-center text-walshe-grey">
          No media yet — add images to your catalog entries.
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <div key={m.object_key} className="card card-hover overflow-hidden p-0">
              <div className="aspect-[16/10] bg-walshe-stone grid place-items-center text-walshe-grey">
                <div className="flex flex-col items-center gap-2">
                  <FileIcon />
                  <span className="text-[12px] text-walshe-grey">{m.content_type}</span>
                </div>
              </div>
              <div className="p-4">
                <p className="truncate font-medium text-walshe-ink">{m.entry_title}</p>
                <p className="mt-1 truncate font-mono text-[12px] text-walshe-grey">{m.object_key}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
