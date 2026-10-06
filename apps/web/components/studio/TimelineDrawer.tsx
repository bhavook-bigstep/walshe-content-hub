"use client";

import SceneControls from "./SceneControls";
import Spinner from "../ui/Spinner";
import type { DesignDoc } from "../../lib/studio/ops";

interface Props {
  open: boolean;
  onToggle: () => void;
  design: DesignDoc;
  activeScene: number;
  onChange: (next: DesignDoc) => void;
  onSelectScene: (sceneIndex: number) => void;
  /** Render the ordered scenes into an MP4. */
  onGenerateVideo: () => void;
  rendering: boolean;
  videoMsg: string | null;
  /** Animation preview transport for the active scene. */
  playing: boolean;
  playhead: number;
  durationMs: number;
  onTogglePlay: () => void;
  onScrub: (timeMs: number) => void;
}

/**
 * The Design Studio's timeline — a top drawer that mirrors the left media drawer, but slides
 * top→bottom. Closed, it tucks up under the menu bar leaving only a semicircle handle poking down
 * at the top-centre; clicking the handle slides the whole scene timeline down into view. Inside:
 * the ordered scene list (durations + transitions) and the video export.
 */
export default function TimelineDrawer({
  open,
  onToggle,
  design,
  activeScene,
  onChange,
  onSelectScene,
  onGenerateVideo,
  rendering,
  videoMsg,
  playing,
  playhead,
  durationMs,
  onTogglePlay,
  onScrub,
}: Props) {
  return (
    // Anchored just below the menu bar, centred, sliding vertically. Closed → shift up by exactly
    // the panel height (h-80 = 20rem) so the panel tucks behind the menu bar and the semicircle
    // handle lands just below the bar, never hidden under it.
    <div
      className={`pointer-events-none absolute left-1/2 top-11 z-30 flex -translate-x-1/2 flex-col items-center transition-transform duration-300 ease-out ${
        open ? "translate-y-0" : "-translate-y-80"
      }`}
    >
      <aside className="pointer-events-auto flex h-80 w-[min(94vw,52rem)] flex-col overflow-hidden rounded-b-xl border border-t-0 border-walshe-line/70 bg-chrome-bg/95 shadow-xl backdrop-blur-md">
        {/* Header: title + video export. */}
        <header className="flex flex-none items-center gap-3 border-b border-walshe-line/70 px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-walshe-grey">
            <rect x="3" y="7" width="5" height="10" rx="1" /><rect x="10" y="7" width="5" height="10" rx="1" /><rect x="17" y="7" width="4" height="10" rx="1" />
          </svg>
          <h2 className="text-small font-bold text-walshe-ink">Timeline</h2>
          <div className="ml-auto flex items-center gap-2">
            {videoMsg && <span className="text-[12px] text-walshe-grey">{videoMsg}</span>}
            <button type="button" onClick={onGenerateVideo} disabled={rendering} className="btn-secondary inline-flex items-center gap-2">
              {rendering && <Spinner />}
              {rendering ? "Rendering…" : "Generate video"}
            </button>
          </div>
        </header>

        {/* Playback transport: preview the active scene's animation (play / scrub). */}
        <div className="flex flex-none items-center gap-3 border-b border-walshe-line/70 px-4 py-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={playing ? "Pause preview" : "Play preview"}
            title={playing ? "Pause" : "Play animation"}
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-walshe-teal text-white transition-colors hover:bg-walshe-teal/90"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(1, durationMs)}
            step={20}
            value={Math.min(playhead, durationMs)}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Animation playhead"
            className="min-w-0 flex-1 accent-walshe-teal"
          />
          <span className="flex-none tabular-nums text-[12px] text-walshe-grey">
            {(Math.min(playhead, durationMs) / 1000).toFixed(1)} / {(durationMs / 1000).toFixed(1)}s
          </span>
        </div>

        {/* Body: the ordered scene timeline. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SceneControls design={design} activeScene={activeScene} onChange={onChange} onSelectScene={onSelectScene} />
        </div>
      </aside>

      {/* Semicircle handle on the bottom boundary of the drawer: pokes down when closed, becomes the
          close grip when open. Clicking slides the timeline up↕down. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Close timeline" : "Open timeline"}
        title={open ? "Hide timeline" : "Show timeline"}
        className="pointer-events-auto relative -mt-px flex h-7 w-16 items-center justify-center rounded-b-full border border-t-0 border-walshe-line/70 bg-chrome-bg/95 text-walshe-ink shadow-xl backdrop-blur-md transition-colors hover:bg-walshe-ink/5"
      >
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
