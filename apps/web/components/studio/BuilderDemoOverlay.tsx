"use client";

/**
 * Visual layer for the scripted AI-Builder demo: a gliding "AI cursor" that shows where the agent is
 * working on the canvas, and a bottom "thinking" bar that streams the agent's narration. Purely
 * presentational — the director (lib/studio/builder-demo.ts) drives the props. Positions are in the
 * studio container's own pixel space (same basis as the canvas's reported scene rect).
 */
export interface DemoCursor {
  left: number;
  top: number;
  /** a brief press/placement pulse when the agent drops an element */
  pressing?: boolean;
}

export default function BuilderDemoOverlay({
  cursor,
  thinking,
  onStop,
}: {
  cursor: DemoCursor | null;
  thinking: string | null;
  onStop: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-hidden={false}>
      {/* The AI cursor — glides to where the agent is about to act. */}
      {cursor && (
        <div
          className="absolute transition-all duration-500 ease-out"
          style={{ left: cursor.left, top: cursor.top, transform: "translate(-4px, -2px)" }}
        >
          {/* placement pulse */}
          <span
            className={`absolute -left-3 -top-3 block h-10 w-10 rounded-full bg-walshe-teal/30 transition-transform duration-300 ${
              cursor.pressing ? "scale-100 opacity-100" : "scale-0 opacity-0"
            }`}
          />
          <svg width="26" height="26" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" aria-hidden>
            <path d="M3 2l7 18 2.5-7.5L20 10z" fill="#0f766e" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="ml-3 mt-0.5 inline-block rounded-full bg-walshe-teal px-2 py-0.5 text-[11px] font-semibold text-white shadow-lift">
            AI Builder
          </span>
        </div>
      )}

      {/* The thinking bar — streams the agent's narration while it works. */}
      {thinking !== null && (
        <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(92%,640px)] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-walshe-line/70 bg-chrome-bg/95 px-4 py-3 shadow-2xl backdrop-blur-md">
            <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-walshe-teal/15" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-walshe-teal animate-pulse">
                <path d="M12 3l1.6 4.8L18.5 9l-4.9 1.2L12 15l-1.6-4.8L5.5 9l4.9-1.2z" />
              </svg>
            </span>
            <p className="min-w-0 flex-1 text-small text-walshe-ink" role="status" aria-live="polite">
              {thinking}
              <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-walshe-teal align-middle motion-safe:animate-pulse" />
            </p>
            <button
              type="button"
              onClick={onStop}
              className="flex-none rounded-lg px-2.5 py-1 text-[12px] font-semibold text-walshe-grey transition-colors hover:bg-walshe-ink/10 hover:text-walshe-ink"
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
