"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addSuccessorSprite,
  chainIds,
  chainMemberDurationMs,
  isSprite,
  MAX_CHAIN_MEMBER_MS,
  MIN_CHAIN_MEMBER_MS,
  removeSuccessor,
  setChainDuration,
  type DesignDoc,
} from "../../lib/studio/ops";
import { SPRITE_ANIMATIONS, type SpriteDef } from "../../lib/studio/graphics";
import { fetchAssetObjectUrl, listMySprites, type UserSprite } from "../../lib/api";

/**
 * Join sprite animations into a chain: the selected sprite plays, then its successor starts exactly
 * where it finished. A vertical, numbered list of small cards (one per chain member) sits to the
 * left of the Inspector — click a card to select & configure that member; the "+" card adds the
 * next sprite (built-in or imported) at the previous one's end state. Scrollable, scrollbar hidden.
 */
export default function SpriteChainPanel({
  design,
  sceneIndex,
  selectedNodeId,
  onChange,
  onSelect,
}: {
  design: DesignDoc;
  sceneIndex: number;
  selectedNodeId: string;
  onChange: (next: DesignDoc) => void;
  onSelect: (sceneIndex: number, nodeId: string) => void;
}) {
  const scene = design.scenes[sceneIndex];
  const selected = scene?.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const chain = selected ? chainIds(scene, selectedNodeId) : [];
  const [picking, setPicking] = useState(false);
  const [userSprites, setUserSprites] = useState<UserSprite[]>([]);
  const thumbs = useRef<Map<number, string>>(new Map()); // sprite id → first-frame URL
  const userFrames = useRef<Map<number, string[]>>(new Map()); // sprite id → all frames (lazy, for hover preview)
  const [, force] = useState(0);

  // Lazily fetch a user sprite's full filmstrip the first time it's hovered, so the card can animate.
  async function loadUserFrames(s: UserSprite) {
    if (userFrames.current.has(s.id) || !s.frame_keys.length) return;
    userFrames.current.set(s.id, []); // in-flight guard (falls back to the still thumb)
    try {
      userFrames.current.set(s.id, await Promise.all(s.frame_keys.map(fetchAssetObjectUrl)));
      force((n) => n + 1);
    } catch {
      userFrames.current.delete(s.id);
    }
  }

  // Release the blob URLs we created when the panel unmounts.
  useEffect(() => {
    const thumbCache = thumbs.current;
    const frameCache = userFrames.current;
    return () => {
      for (const u of thumbCache.values()) URL.revokeObjectURL(u);
      for (const arr of frameCache.values()) for (const u of arr) URL.revokeObjectURL(u);
    };
  }, []);

  useEffect(() => {
    if (!picking) return;
    (async () => {
      try {
        const list = await listMySprites();
        setUserSprites(list);
        await Promise.all(
          list.map(async (s) => {
            if (thumbs.current.has(s.id) || !s.frame_keys.length) return;
            try {
              thumbs.current.set(s.id, await fetchAssetObjectUrl(s.frame_keys[0]));
              force((n) => n + 1);
            } catch {
              /* thumb optional */
            }
          }),
        );
      } catch {
        /* list optional */
      }
    })();
  }, [picking]);

  if (!selected || !isSprite(selected)) return null;

  function selectAfterAdd(next: DesignDoc) {
    const newId = next.scenes[sceneIndex]?.nodes.find((n) => n.id === selectedNodeId)?.successorId;
    onChange(next);
    if (newId) onSelect(sceneIndex, newId);
    setPicking(false);
  }
  function addBuiltin(sp: SpriteDef) {
    selectAfterAdd(
      addSuccessorSprite(design, sceneIndex, selectedNodeId, {
        frames: sp.frames,
        fps: sp.fps,
        width: sp.width,
        height: sp.height,
      }),
    );
  }
  async function addUser(s: UserSprite) {
    try {
      const frames = await Promise.all(s.frame_keys.map(fetchAssetObjectUrl));
      if (frames.length) {
        selectAfterAdd(
          addSuccessorSprite(design, sceneIndex, selectedNodeId, {
            frames,
            fps: s.fps,
            width: s.frame_width || 160,
            height: s.frame_height || 160,
            spriteRef: `user:${s.id}`,
          }),
        );
      }
    } catch {
      /* add optional */
    }
  }

  return (
    <div className="pointer-events-auto absolute right-[23.5rem] top-24 z-30 flex max-h-[calc(100vh-13rem)] w-24 flex-col rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-2 shadow-xl backdrop-blur-md">
      <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-walshe-grey">Chain</p>
      <div className="no-scrollbar flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {chain.map((id, i) => {
          const member = scene.nodes.find((n) => n.id === id);
          const thumb = member?.frames?.[0] ?? member?.src;
          const on = id === selectedNodeId;
          return (
            <div key={id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(sceneIndex, id)}
                aria-pressed={on}
                aria-label={`Sprite ${i + 1} in the chain`}
                className={`grid aspect-square w-full place-items-center overflow-hidden rounded-lg border p-1 transition-colors ${
                  on ? "border-walshe-teal bg-walshe-teal/10" : "border-walshe-line bg-walshe-stone/40 hover:border-walshe-ink/30"
                }`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-contain" draggable={false} />
                ) : (
                  <span className="text-[9px] text-walshe-grey">sprite</span>
                )}
              </button>
              <span className="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-walshe-ink text-[9px] font-bold text-white">
                {i + 1}
              </span>
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(removeSuccessor(design, sceneIndex, id))}
                  aria-label={`Remove sprite ${i + 1}`}
                  className="absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-walshe-danger text-white group-hover:grid"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setPicking(true)}
          title="Add the next sprite — it starts where this one ends"
          aria-label="Add successor sprite"
          className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-walshe-line text-walshe-grey transition-colors hover:border-walshe-teal hover:text-walshe-teal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {/* Duration of the selected sprite's turn on stage (only meaningful once it's in a chain). */}
      {chain.length > 1 && (
        <div className="mt-2 border-t border-walshe-line/70 pt-2">
          <div className="mb-1 flex items-baseline justify-between px-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-walshe-grey">Duration</span>
            <span className="text-[10px] font-medium tabular-nums text-walshe-ink">
              {(chainMemberDurationMs(selected) / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={MIN_CHAIN_MEMBER_MS}
            max={MAX_CHAIN_MEMBER_MS}
            step={100}
            value={Math.min(MAX_CHAIN_MEMBER_MS, Math.max(MIN_CHAIN_MEMBER_MS, Math.round(chainMemberDurationMs(selected))))}
            onChange={(e) => onChange(setChainDuration(design, sceneIndex, selectedNodeId, Number(e.target.value)))}
            aria-label="How long this sprite plays before its successor"
            className="h-1.5 w-full cursor-pointer accent-walshe-teal"
          />
        </div>
      )}

      {/* Portal to <body>: the panel's own backdrop-blur makes it the containing block for `fixed`,
          which would otherwise trap this modal inside the narrow 6rem chain column. */}
      {picking && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-walshe-deep/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-label="Pick the successor sprite"
          onClick={() => setPicking(false)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-walshe-line bg-chrome-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-walshe-line/70 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-walshe-ink">Add the next sprite</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-walshe-grey">
                  It picks up where sprite {chain.length} finishes — hover a card to preview its motion.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setPicking(false)}
                className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section>
                <SectionHead title="Sprite library" count={SPRITE_ANIMATIONS.length} />
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {SPRITE_ANIMATIONS.map((s) => (
                    <PickCard
                      key={s.id}
                      label={s.label}
                      frameCount={s.frames.length}
                      frames={s.frames}
                      fps={s.fps}
                      onAdd={() => addBuiltin(s)}
                    />
                  ))}
                </div>
              </section>

              <section>
                <SectionHead title="Your sprites" count={userSprites.length} />
                {userSprites.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {userSprites.map((s) => (
                      <PickCard
                        key={s.id}
                        label={s.name}
                        frameCount={s.frame_keys.length}
                        frames={userFrames.current.get(s.id) ?? []}
                        thumb={thumbs.current.get(s.id)}
                        fps={s.fps}
                        onAdd={() => void addUser(s)}
                        onHover={() => void loadUserFrames(s)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-walshe-line bg-walshe-stone/30 px-4 py-6 text-center">
                    <p className="text-[12px] text-walshe-grey">
                      No imported sprites yet. Add your own from{" "}
                      <span className="font-semibold text-walshe-ink">Animated → +</span> in the right rail.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A section heading with a small count pill. */
function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">{title}</span>
      <span className="rounded-full bg-walshe-ink/10 px-1.5 text-[10px] font-semibold tabular-nums text-walshe-grey">{count}</span>
    </div>
  );
}

/** A frame-by-frame preview that animates (at its fps) only while `playing` — else rests on frame 0. */
function AnimatedThumb({ frames, fps, playing, alt }: { frames: string[]; fps?: number; playing: boolean; alt: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!playing || frames.length < 2) {
      setI(0);
      return;
    }
    const ms = 1000 / (fps && fps > 0 ? fps : 10);
    const id = window.setInterval(() => setI((p) => (p + 1) % frames.length), ms);
    return () => window.clearInterval(id);
  }, [playing, frames, fps]);
  const src = frames[Math.min(i, frames.length - 1)] ?? frames[0];
  if (!src) return <span className="text-[10px] text-walshe-grey">…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="h-full w-full object-contain" draggable={false} />;
}

/** A sprite choice: an animated-on-hover preview with an "Add" reveal, its name and frame count. */
function PickCard({
  label,
  frameCount,
  frames,
  fps,
  thumb,
  onAdd,
  onHover,
}: {
  label: string;
  frameCount: number;
  frames: string[];
  fps?: number;
  thumb?: string;
  onAdd: () => void;
  onHover?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const previewFrames = frames.length ? frames : thumb ? [thumb] : [];
  return (
    <button
      type="button"
      onClick={onAdd}
      onMouseEnter={() => {
        setHover(true);
        onHover?.();
      }}
      onMouseLeave={() => setHover(false)}
      title={label}
      aria-label={`Add ${label}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-walshe-line bg-walshe-stone/40 text-left transition-all hover:-translate-y-0.5 hover:border-walshe-teal hover:shadow-md"
    >
      <span className="relative grid aspect-square w-full place-items-center overflow-hidden bg-white/70 p-1.5">
        <AnimatedThumb frames={previewFrames} fps={fps} playing={hover} alt={label} />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1 bg-walshe-teal py-1 text-[11px] font-semibold text-white transition-transform duration-150 group-hover:translate-y-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add
        </span>
      </span>
      <span className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="truncate text-[11px] font-medium text-walshe-ink">{label}</span>
        <span className="shrink-0 rounded-full bg-walshe-ink/10 px-1.5 text-[9px] font-medium tabular-nums text-walshe-grey">{frameCount}f</span>
      </span>
    </button>
  );
}
