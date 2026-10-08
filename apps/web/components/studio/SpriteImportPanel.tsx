"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  deleteSprite,
  fetchAssetObjectUrl,
  importSprites,
  listMySprites,
  type UserSprite,
} from "../../lib/api";
import { addGraphic, type DesignDoc } from "../../lib/studio/ops";

/**
 * Import your own sprite animations: upload a sprite sheet (PNG) or a ZIP of sheets, the
 * server slices each into frames, then a confirmation step lets you choose which sprites to keep
 * (a pack/folder can contain many). Kept sprites show in a grid and insert onto the active scene.
 */
export default function SpriteImportPanel({
  design,
  sceneIndex,
  onChange,
}: {
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
}) {
  const [sprites, setSprites] = useState<UserSprite[]>([]);
  const [pending, setPending] = useState<UserSprite[] | null>(null); // just-imported, awaiting "keep"
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const thumbs = useRef<Map<number, string>>(new Map()); // sprite id → first-frame blob URL
  const [, force] = useState(0); // re-render as thumbnails resolve

  useEffect(() => {
    void refresh();
    const cache = thumbs.current;
    return () => {
      for (const u of cache.values()) URL.revokeObjectURL(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resolveThumbs(list: UserSprite[]) {
    await Promise.all(
      list.map(async (s) => {
        if (thumbs.current.has(s.id) || !s.frame_keys.length) return;
        try {
          thumbs.current.set(s.id, await fetchAssetObjectUrl(s.frame_keys[0]));
          force((n) => n + 1);
        } catch {
          /* thumbnail optional */
        }
      }),
    );
  }

  async function refresh() {
    try {
      const list = await listMySprites();
      setSprites(list);
      void resolveThumbs(list);
    } catch {
      /* list optional */
    }
  }

  async function onFile(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await importSprites(file);
      if (!result.length) {
        setMsg("No sprites found — use a sprite sheet (a strip/grid of equal frames) or a ZIP of them.");
        return;
      }
      setPending(result);
      setKeep(new Set(result.map((s) => s.id))); // default: keep all
      void resolveThumbs(result);
    } catch {
      setMsg("Could not process that file.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmKeep() {
    if (!pending) return;
    setBusy(true);
    try {
      await Promise.all(pending.filter((s) => !keep.has(s.id)).map((s) => deleteSprite(s.id).catch(() => {})));
      setPending(null);
      setKeep(new Set());
      await refresh();
      setMsg(null);
    } finally {
      setBusy(false);
    }
  }

  async function discardAll() {
    if (!pending) return;
    setBusy(true);
    try {
      await Promise.all(pending.map((s) => deleteSprite(s.id).catch(() => {})));
      setPending(null);
      setKeep(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function removeKept(id: number) {
    await deleteSprite(id).catch(() => {});
    setSprites((prev) => prev.filter((s) => s.id !== id));
  }

  async function insert(s: UserSprite) {
    try {
      const frames = await Promise.all(s.frame_keys.map(fetchAssetObjectUrl));
      if (!frames.length) return;
      onChange(
        addGraphic(
          design,
          sceneIndex,
          {
            frames,
            fps: s.fps,
            width: s.frame_width || 160,
            height: s.frame_height || 160,
            sprite: `user:${s.id}`,
          },
          { width: s.frame_width || 160, height: s.frame_height || 160 },
        ),
      );
    } catch {
      /* insert optional */
    }
  }

  const toggle = (id: number) =>
    setKeep((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      {/* Header row: a compact "+" upload button at the top of the panel, beside the label. */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Your sprites</p>
        <label title="Import a sprite sheet (PNG) or a ZIP of sheets">
          <span
            aria-hidden
            className={`grid h-7 w-7 place-items-center rounded-md border border-walshe-line bg-walshe-stone/40 text-walshe-ink transition-colors ${
              busy ? "cursor-wait opacity-60" : "cursor-pointer hover:border-walshe-teal hover:bg-walshe-ink/5"
            }`}
          >
            {busy ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </span>
          <input
            type="file"
            accept="image/png,application/zip,.zip,.png"
            className="hidden"
            disabled={busy}
            aria-label="Import a sprite sheet or ZIP"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.currentTarget.value = ""; // allow re-importing the same file
              if (f) void onFile(f);
            }}
          />
        </label>
      </div>
      {msg && <p className="text-[11px] leading-snug text-walshe-grey">{msg}</p>}

      {sprites.length > 0 ? (
        <div>
          <div className="grid grid-cols-4 gap-1.5">
            {sprites.map((s) => (
              <div key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => void insert(s)}
                  title={`${s.name} · ${s.frame_keys.length} frames`}
                  aria-label={`Add ${s.name}`}
                  className="grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-walshe-line bg-walshe-stone/40 p-1 transition-colors hover:border-walshe-teal hover:bg-walshe-ink/5"
                >
                  {thumbs.current.get(s.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs.current.get(s.id)} alt={s.name} className="h-full w-full object-contain" draggable={false} />
                  ) : (
                    <span className="text-[9px] text-walshe-grey">{s.name.slice(0, 8)}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void removeKept(s.id)}
                  aria-label={`Delete ${s.name}`}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-walshe-ink text-white group-hover:grid"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        !busy && (
          <p className="text-[11px] leading-snug text-walshe-grey">
            Tap <span className="font-semibold text-walshe-ink">+</span> to import a sprite sheet (PNG)
            or a ZIP of sheets.
          </p>
        )
      )}

      {/* Confirmation: a folder/ZIP can hold many sprites — pick which to keep. Portalled to <body>
          so the right-rail popover's backdrop-blur doesn't trap this `fixed` overlay inside it. */}
      {pending && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-center bg-walshe-deep/50 p-4 backdrop-blur-sm" role="dialog" aria-label="Confirm imported sprites">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-walshe-line bg-chrome-bg p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-small font-bold text-walshe-ink">Keep which sprites?</h3>
              <span className="text-[12px] text-walshe-grey">
                {keep.size} of {pending.length} selected
              </span>
            </div>
            <div className="mb-3 grid flex-1 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {pending.map((s) => {
                const on = keep.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-pressed={on}
                    className={`relative flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors ${
                      on ? "border-walshe-teal bg-walshe-teal/10" : "border-walshe-line bg-walshe-stone/40 opacity-60"
                    }`}
                  >
                    <span className="grid aspect-square w-full place-items-center overflow-hidden rounded bg-white/50">
                      {thumbs.current.get(s.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbs.current.get(s.id)} alt={s.name} className="h-full w-full object-contain" draggable={false} />
                      ) : (
                        <span className="text-[9px] text-walshe-grey">…</span>
                      )}
                    </span>
                    <span className="w-full truncate text-[10px] font-medium text-walshe-ink">{s.name}</span>
                    <span className="text-[9px] text-walshe-grey">{s.frame_keys.length}f</span>
                    {on && (
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-walshe-teal text-white">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost h-9" disabled={busy} onClick={() => void discardAll()}>
                Discard all
              </button>
              <button type="button" className="btn-primary h-9" disabled={busy || keep.size === 0} onClick={() => void confirmKeep()}>
                {busy ? "Saving…" : `Keep ${keep.size}`}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
