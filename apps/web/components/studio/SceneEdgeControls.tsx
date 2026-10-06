"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  MAX_SCENE_DURATION_MS,
  MIN_SCENE_DURATION_MS,
  TRANSITION_KINDS,
  addScene,
  narrationCues,
  removeScene,
  renameScene,
  reorderScene,
  setSceneDuration,
  setSceneNarration,
  setSceneTransition,
  type DesignDoc,
  type NarrationCue,
  type TransitionKind,
} from "../../lib/studio/ops";

export interface SceneRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  rect: SceneRect | null;
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
  // Animation preview transport for the active scene.
  playing: boolean;
  playhead: number;
  durationMs: number;
  onTogglePlay: () => void;
  onScrub: (timeMs: number) => void;
  // Voiceover on/off for the exported video.
  narrate: boolean;
  onToggleNarrate: () => void;
}

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg text-walshe-ink transition-colors hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-40";

const TRANSITION_LABEL: Record<TransitionKind, string> = {
  none: "Cut",
  fade: "Fade",
  "slide-left": "Slide",
  zoom: "Zoom",
};

/**
 * The selected scene's control panel: one fixed-size card (so it never resizes as the canvas zooms)
 * anchored below the scene and following it as it pans. It encloses two menus in a subtle dotted
 * box — the top menu (identity + timing) and the bottom menu (animation player + time-cued
 * narration). Hidden when no scene is selected.
 */
export default function SceneEdgeControls({
  rect,
  design,
  sceneIndex,
  onChange,
  playing,
  playhead,
  durationMs,
  onTogglePlay,
  onScrub,
  narrate,
  onToggleNarrate,
}: Props) {
  // Measure the panel so it can be clamped on screen; its size is content-driven (never zoom-driven).
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(230);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      if (panelRef.current) setPanelH(panelRef.current.offsetHeight);
    });
    if (panelRef.current) ro.observe(panelRef.current);
    return () => ro.disconnect();
  });

  const scene = design.scenes[sceneIndex];
  if (!rect || !scene) return null;

  const upd = (fn: (d: DesignDoc) => DesignDoc) => onChange(fn(design));
  const cues = narrationCues(scene);
  const setCues = (next: NarrationCue[]) => upd((d) => setSceneNarration(d, scene.id, next));

  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 900;
  const boxW = Math.min(viewportW * 0.92, 720);
  const centerX = Math.min(Math.max(rect.left + rect.width / 2, boxW / 2 + 8), viewportW - boxW / 2 - 8);
  // Sit just below the scene's bottom edge, clamped on screen. Size is fixed → no resize on zoom.
  const top = Math.min(Math.max(rect.top + rect.height + 12, 56), viewportH - panelH - 12);
  const isLast = sceneIndex >= design.scenes.length - 1;
  const t = Math.min(playhead, durationMs);

  const sectionCls = "rounded-xl bg-walshe-stone/35 px-2.5 py-1.5";

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute z-30 -translate-x-1/2 space-y-2 rounded-2xl border-2 border-dashed border-walshe-grey/35 bg-chrome-bg/95 p-2 shadow-xl backdrop-blur-md"
      style={{ left: centerX, top, width: boxW }}
    >
      {/* ── Top menu: identity + timing ─────────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center justify-center gap-1.5 ${sectionCls}`}>
        <input
          value={scene.name}
          onChange={(e) => upd((d) => renameScene(d, scene.id, e.target.value))}
          aria-label="Scene name"
          className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-small font-semibold text-walshe-ink hover:border-walshe-line focus:border-walshe-mint focus:bg-walshe-base focus:outline-none"
        />
        <span className="whitespace-nowrap text-[11px] tabular-nums text-walshe-grey">
          Scene {sceneIndex + 1} of {design.scenes.length}
        </span>
        <span aria-hidden className="h-6 w-px bg-walshe-line" />
        <label className="flex items-center gap-1 rounded-lg bg-walshe-base/70 px-2 py-1 text-[11px] font-medium text-walshe-grey" title="Scene duration (seconds)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg>
          <input
            type="number"
            min={MIN_SCENE_DURATION_MS / 1000}
            max={MAX_SCENE_DURATION_MS / 1000}
            step={0.5}
            value={Number((scene.durationMs / 1000).toFixed(1))}
            onChange={(e) => upd((d) => setSceneDuration(d, scene.id, Math.round((Number(e.target.value) || 1) * 1000)))}
            aria-label="Scene duration (s)"
            className="w-11 bg-transparent text-right text-walshe-ink focus:outline-none"
          />
          s
        </label>
        {!isLast && (
          <label className="flex items-center gap-1 rounded-lg bg-walshe-base/70 px-2 py-1 text-[11px] font-medium text-walshe-grey" title="Transition into the next scene">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12h14M13 6l6 6-6 6" /></svg>
            <select
              value={scene.transition}
              onChange={(e) => upd((d) => setSceneTransition(d, scene.id, e.target.value as TransitionKind))}
              aria-label="Transition to next scene"
              className="bg-transparent text-walshe-ink focus:outline-none"
            >
              {TRANSITION_KINDS.map((tr) => (
                <option key={tr} value={tr}>{TRANSITION_LABEL[tr]}</option>
              ))}
            </select>
          </label>
        )}
        <span aria-hidden className="h-6 w-px bg-walshe-line" />
        <button type="button" className={iconBtn} title="Move scene left" disabled={sceneIndex === 0} onClick={() => upd((d) => reorderScene(d, sceneIndex, sceneIndex - 1))}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className={iconBtn} title="Move scene right" disabled={isLast} onClick={() => upd((d) => reorderScene(d, sceneIndex, sceneIndex + 1))}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <button type="button" className={iconBtn} title="Add a scene after this one" onClick={() => upd((d) => addScene(d))}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className={`${iconBtn} text-walshe-danger hover:bg-walshe-danger/10`} title="Delete this scene" disabled={design.scenes.length <= 1} onClick={() => upd((d) => removeScene(d, sceneIndex))}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" /></svg>
        </button>
      </div>

      {/* ── Bottom menu: player (row 1) + time-cued narration (row 2) ──────────────────── */}
      <div className={`flex flex-col gap-2 ${sectionCls} py-2`}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause preview" : "Play preview"}
            title={playing ? "Pause" : "Play animation"}
            className="grid h-8 w-8 flex-none place-items-center rounded-full bg-walshe-teal text-white transition-colors hover:bg-walshe-teal/90"
          >
            {playing ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={20}
            value={t}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Animation playhead"
            className="min-w-0 flex-1 accent-walshe-teal"
          />
          <span className="flex-none tabular-nums text-[11px] text-walshe-grey">
            {(t / 1000).toFixed(1)} / {(durationMs / 1000).toFixed(1)}s
          </span>
        </div>

        <div aria-hidden className="border-t border-walshe-line/60" />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Narration</span>
            <div className="flex items-center gap-2.5">
              <label className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-walshe-ink" title="Read the narration aloud in the exported video">
                <input type="checkbox" checked={narrate} onChange={onToggleNarrate} className="accent-walshe-teal" />
                Voiceover
              </label>
              <button
                type="button"
                onClick={() => setCues([...cues, { atMs: Math.round(t), text: "" }])}
                className="rounded-md border border-walshe-line px-2 py-0.5 text-[11px] font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
              >
                + line at {(t / 1000).toFixed(1)}s
              </button>
            </div>
          </div>
          {cues.length === 0 ? (
            <p className="text-[11px] text-walshe-grey">
              Scrub the player and add lines — each one is spoken starting at its cue time.
            </p>
          ) : (
            <div className="max-h-28 space-y-1 overflow-y-auto pr-0.5">
              {cues.map((cue, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <label className="flex flex-none items-center gap-0.5 text-[11px] text-walshe-grey" title="Start time (seconds)">
                    <input
                      type="number"
                      min={0}
                      max={Math.round(durationMs / 1000)}
                      step={0.1}
                      value={Number((cue.atMs / 1000).toFixed(1))}
                      onChange={(e) => {
                        const next = cues.slice();
                        next[i] = { ...cue, atMs: Math.round((Number(e.target.value) || 0) * 1000) };
                        setCues(next);
                      }}
                      aria-label={`Narration line ${i + 1} start (s)`}
                      className="w-12 rounded border border-walshe-line bg-walshe-base px-1 py-0.5 text-right text-[11px] text-walshe-ink focus:border-walshe-mint focus:outline-none"
                    />
                    s
                  </label>
                  <input
                    value={cue.text}
                    onChange={(e) => {
                      const next = cues.slice();
                      next[i] = { ...cue, text: e.target.value };
                      setCues(next);
                    }}
                    maxLength={300}
                    placeholder="What the voiceover says…"
                    aria-label={`Narration line ${i + 1} text`}
                    className="min-w-0 flex-1 rounded-md border border-walshe-line bg-walshe-base px-2 py-1 text-[12px] text-walshe-ink focus:border-walshe-mint focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Delete narration line ${i + 1}`}
                    onClick={() => setCues(cues.filter((_, idx) => idx !== i))}
                    className="grid h-6 w-6 flex-none place-items-center rounded text-walshe-danger transition-colors hover:bg-walshe-danger/10"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
