"use client";

import { useEffect, useRef, useState } from "react";
import { builderDesign, renderVideo } from "../../lib/api";
import type { BuilderCatalogItem } from "./BuilderPanel";

/** One editable scene. `id` is a stable client key; the API receives item_id/title/caption. */
export interface VideoScene {
  id: number;
  itemId: number | null;
  title: string;
  caption: string;
}

/** Server limits (apps/api/app/routers/render.py + media/video.py). */
export const MAX_SCENES = 20;
export const MAX_TEXT = 200;

/** Pure: catalog items -> default scene list (one scene per item, bounded). Deterministic. */
export function scenesFromItems(items: BuilderCatalogItem[]): VideoScene[] {
  return items.slice(0, MAX_SCENES).map((it, i) => ({
    id: i + 1,
    itemId: it.id,
    title: it.title.trim().slice(0, MAX_TEXT),
    caption: (it.description ?? "").trim().slice(0, MAX_TEXT),
  }));
}

/** Pure: overlay Builder `write-copy` text onto scenes as captions; malformed ops are ignored. */
export function applyBuilderCopy(scenes: VideoScene[], response: Record<string, unknown>): VideoScene[] {
  const ops = Array.isArray(response.ops) ? (response.ops as Record<string, unknown>[]) : [];
  const copy = new Map<number, string>();
  for (const op of ops) {
    if (
      op &&
      op.op === "write-copy" &&
      typeof op.item_id === "number" &&
      typeof op.text === "string" &&
      op.text.trim() &&
      !copy.has(op.item_id)
    ) {
      copy.set(op.item_id, op.text.trim().slice(0, MAX_TEXT));
    }
  }
  return scenes.map((s) => (s.itemId !== null && copy.has(s.itemId) ? { ...s, caption: copy.get(s.itemId)! } : s));
}

/** Request scene shape accepted by POST /render/video. */
export interface VideoRequestScene {
  item_id: number | null;
  title: string;
  caption: string;
}

/** Pure: scenes -> request scenes. Blank-title scenes are dropped; returns [] if nothing to render. */
export function scenesToRequest(scenes: VideoScene[]): VideoRequestScene[] {
  return scenes
    .map((s) => ({
      item_id: s.itemId,
      title: s.title.trim().slice(0, MAX_TEXT),
      caption: s.caption.trim().slice(0, MAX_TEXT),
    }))
    .filter((s) => s.title !== "")
    .slice(0, MAX_SCENES);
}

export default function VideoPanel({ items }: { items: BuilderCatalogItem[] }) {
  const [scenes, setScenes] = useState<VideoScene[]>(() => scenesFromItems(items));
  const [narrate, setNarrate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const nextId = useRef(items.length + 1);
  const urlRef = useRef<string | null>(null);

  // Revoke any object URL on unmount.
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function setUrl(next: string | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = next;
    setVideoUrl(next);
  }

  function update(id: number, patch: Partial<VideoScene>) {
    setScenes((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function remove(id: number) {
    setScenes((cur) => cur.filter((s) => s.id !== id));
  }

  function move(id: number, delta: -1 | 1) {
    setScenes((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  function add() {
    setScenes((cur) =>
      cur.length >= MAX_SCENES ? cur : [...cur, { id: nextId.current++, itemId: null, title: "", caption: "" }],
    );
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    const base = scenesFromItems(items);
    try {
      const response = await builderDesign({
        prompt: "Write a short caption for each scene of a promotional video.",
        item_ids: items.map((it) => it.id),
      });
      nextId.current = base.length + 1;
      setScenes(applyBuilderCopy(base, response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate the scene script.");
    } finally {
      setGenerating(false);
    }
  }

  async function render() {
    const payload = scenesToRequest(scenes);
    if (payload.length === 0) {
      setError("Add at least one scene with a title.");
      return;
    }
    setRendering(true);
    setError(null);
    try {
      const blob = await renderVideo({ scenes: payload, narrate });
      setUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video render failed.");
    } finally {
      setRendering(false);
    }
  }

  const busy = generating || rendering;
  // Compact outlined chip for secondary / per-scene controls.
  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-sm border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small font-medium text-walshe-ink transition-colors hover:border-walshe-ink/30 hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-50";
  // Tiny controls inside a scene row.
  const mini =
    "inline-flex items-center justify-center rounded-sm border border-walshe-line bg-walshe-stone/60 px-2.5 py-1 text-[13px] font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-50";
  const field = "field text-small";

  return (
    <section aria-label="Video" className="flex flex-col gap-4">
      <p className="text-small text-walshe-grey">Turn your selection into a short narrated highlight reel.</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={busy || items.length === 0} onClick={() => void generate()}>
          {generating ? "Generating…" : "Auto-generate scenes"}
        </button>
        <button type="button" className={btn} disabled={busy || scenes.length >= MAX_SCENES} onClick={add}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add scene
        </button>
      </div>

      <label className="flex items-center gap-2 text-small font-medium text-walshe-ink">
        <input type="checkbox" className="h-4 w-4 accent-walshe-teal" checked={narrate} onChange={(e) => setNarrate(e.target.checked)} />
        Voiceover
      </label>

      {error && (
        <p role="alert" className="text-small text-walshe-danger">
          {error}
        </p>
      )}

      {scenes.length === 0 ? (
        <p className="rounded-md border border-dashed border-walshe-line bg-walshe-mist/50 px-4 py-6 text-center text-small text-walshe-grey">
          {items.length === 0
            ? "Select catalog items to build a video, or add a scene manually."
            : "No scenes yet. Auto-generate a script from your selection or add a scene."}
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {scenes.map((s, i) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-md border border-walshe-line bg-walshe-mist/40 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-small font-semibold text-walshe-ink">
                  <span className="grid h-6 w-6 place-items-center rounded-sm bg-walshe-mint text-[12px] font-bold text-walshe-teal">{i + 1}</span>
                  Scene {i + 1}
                </span>
                <span className="flex gap-1">
                  <button type="button" className={mini} aria-label={`Move scene ${i + 1} up`} disabled={busy || i === 0} onClick={() => move(s.id, -1)}>
                    Up
                  </button>
                  <button type="button" className={mini} aria-label={`Move scene ${i + 1} down`} disabled={busy || i === scenes.length - 1} onClick={() => move(s.id, 1)}>
                    Down
                  </button>
                  <button type="button" className={mini} aria-label={`Remove scene ${i + 1}`} disabled={busy} onClick={() => remove(s.id)}>
                    Remove
                  </button>
                </span>
              </div>
              <input
                className={field}
                aria-label={`Scene ${i + 1} title`}
                placeholder="Scene title"
                maxLength={MAX_TEXT}
                value={s.title}
                disabled={busy}
                onChange={(e) => update(s.id, { title: e.target.value })}
              />
              <textarea
                className="field-area text-small"
                aria-label={`Scene ${i + 1} caption`}
                placeholder="Caption"
                maxLength={MAX_TEXT}
                rows={2}
                value={s.caption}
                disabled={busy}
                onChange={(e) => update(s.id, { caption: e.target.value })}
              />
            </li>
          ))}
        </ol>
      )}

      <button
        type="button"
        className="btn-primary self-start"
        disabled={busy || scenes.length === 0}
        onClick={() => void render()}
      >
        {rendering ? "Rendering…" : videoUrl ? "Re-render video" : "Render video"}
      </button>

      {rendering && !videoUrl && <p className="text-small text-walshe-grey">Rendering video, this can take a moment…</p>}
      {videoUrl && (
        <video controls src={videoUrl} className="w-full rounded-md border border-walshe-line" aria-label="Video preview" />
      )}
    </section>
  );
}
