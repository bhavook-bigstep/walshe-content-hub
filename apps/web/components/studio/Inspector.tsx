"use client";

import { useEffect, useRef, useState } from "react";
import { enterTrack, nodeStateAt } from "../../lib/studio/anim";
import { FONTS } from "../../lib/studio/fonts";
import {
  EASINGS,
  ENTER_TYPES,
  LOOP_TYPES,
  type AnimKeyframe,
  type DesignNode,
  type Easing,
  type EnterType,
  type LayerMove,
  type LoopType,
  type NodeAnimation,
  type NodeStyle,
} from "../../lib/studio/ops";

// Web-safe / default-stack families so the canvas (and PNG export) actually render them.

interface Props {
  node: DesignNode | null;
  onChange: (patch: Partial<NodeStyle>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (move: LayerMove) => void;
  /** Set (or clear) the selected element's keyframe animation. */
  onAnim: (anim: NodeAnimation | undefined) => void;
  /** The scene's duration + the current preview playhead (ms), for the keyframe track. */
  sceneDurationMs: number;
  playheadMs: number;
  /** True when this element is a successor in a sprite chain: its 0s ("start") state is locked to the
   * previous sprite's end and shown read-only (greyed) — it can never be edited independently. */
  startLocked?: boolean;
}

const ENTER_LABEL: Record<EnterType | "none", string> = {
  none: "None",
  fade: "Fade in",
  rise: "Rise up",
  "slide-left": "Slide in ←",
  "slide-right": "Slide in →",
  scale: "Scale up",
};

const LOOP_LABEL: Record<LoopType, string> = {
  pulse: "Pulse",
  bob: "Bob",
  sway: "Sway",
  waddle: "Waddle",
  float: "Float",
  spin: "Spin",
  twinkle: "Twinkle",
  drift: "Drift",
  rock: "Rock",
};

// Per-element animation: an entrance preset (type · start · duration · easing) + an emphasis loop.
// Writes a NodeAnimation; the engine expands the entrance into keyframes and plays it.
function AnimControls({ node, onAnim }: { node: DesignNode; onAnim: Props["onAnim"] }) {
  const a = node.anim;
  const [enter, setEnter] = useState<EnterType | "none">(a?.enter?.type ?? "none");
  const [start, setStart] = useState(a?.enter?.startMs ?? 0);
  const [dur, setDur] = useState(a?.enter?.durationMs ?? 500);
  const [ez, setEz] = useState<Easing>(a?.enter?.ease ?? "easeOut");
  const [loop, setLoop] = useState<"none" | LoopType>(a?.loop?.type ?? "none");
  const [period, setPeriod] = useState(a?.loop?.periodMs ?? 1200);

  // Re-sync the controls when a different element is selected.
  useEffect(() => {
    const cur = node.anim;
    setEnter(cur?.enter?.type ?? "none");
    setStart(cur?.enter?.startMs ?? 0);
    setDur(cur?.enter?.durationMs ?? 500);
    setEz(cur?.enter?.ease ?? "easeOut");
    setLoop(cur?.loop?.type ?? "none");
    setPeriod(cur?.loop?.periodMs ?? 1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  function emit(next: Partial<{ enter: EnterType | "none"; start: number; dur: number; ez: Easing; loop: "none" | LoopType; period: number }>) {
    const c = { enter, start, dur, ez, loop, period, ...next };
    const keyframes = c.enter === "none" ? [] : enterTrack(node, c.enter, c.start, c.dur, c.ez).keyframes;
    const anim: NodeAnimation = {
      keyframes,
      enter: c.enter === "none" ? undefined : { type: c.enter, startMs: c.start, durationMs: c.dur, ease: c.ez },
      loop: c.loop === "none" ? undefined : { type: c.loop, periodMs: c.period },
    };
    onAnim(keyframes.length > 0 || anim.loop ? anim : undefined);
  }

  return (
    <div className="space-y-2.5 border-t border-walshe-line/70 pt-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Animation</p>
      <div className={row}>
        <span className={label}>Entrance</span>
        <select
          value={enter}
          onChange={(e) => { const v = e.target.value as EnterType | "none"; setEnter(v); emit({ enter: v }); }}
          aria-label="Entrance animation"
          className={`${field} w-36`}
        >
          {(["none", ...ENTER_TYPES] as (EnterType | "none")[]).map((t) => (
            <option key={t} value={t}>{ENTER_LABEL[t]}</option>
          ))}
        </select>
      </div>
      {enter !== "none" && (
        <>
          <div className={row}>
            <span className={label}>Start (ms)</span>
            <input type="number" min={0} max={30000} step={100} value={start}
              onChange={(e) => { const v = Number(e.target.value) || 0; setStart(v); emit({ start: v }); }}
              aria-label="Entrance start" className={`${field} w-24 text-right`} />
          </div>
          <div className={row}>
            <span className={label}>Duration (ms)</span>
            <input type="number" min={50} max={10000} step={50} value={dur}
              onChange={(e) => { const v = Number(e.target.value) || 50; setDur(v); emit({ dur: v }); }}
              aria-label="Entrance duration" className={`${field} w-24 text-right`} />
          </div>
          <div className={row}>
            <span className={label}>Easing</span>
            <select value={ez} onChange={(e) => { const v = e.target.value as Easing; setEz(v); emit({ ez: v }); }}
              aria-label="Entrance easing" className={`${field} w-36`}>
              {EASINGS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </>
      )}
      <div className={row}>
        <span className={label}>Motion</span>
        <select value={loop} onChange={(e) => { const v = e.target.value as "none" | LoopType; setLoop(v); emit({ loop: v }); }}
          aria-label="Motion loop" className={`${field} w-36`}>
          <option value="none">None</option>
          {LOOP_TYPES.map((t) => (
            <option key={t} value={t}>{LOOP_LABEL[t]}</option>
          ))}
        </select>
      </div>
      {loop !== "none" && (
        <div className={row}>
          <span className={label}>Speed (ms)</span>
          <input type="number" min={300} max={30000} step={100} value={period}
            onChange={(e) => { const v = Number(e.target.value) || 1200; setPeriod(v); emit({ period: v }); }}
            aria-label="Motion period" className={`${field} w-24 text-right`} />
        </div>
      )}
    </div>
  );
}

const row = "flex items-center justify-between gap-2 py-1.5";
const label = "text-[11px] font-semibold uppercase tracking-wide text-walshe-grey";
const field =
  "h-8 rounded-md border border-walshe-line bg-walshe-base px-2 text-small text-walshe-ink focus:border-walshe-mint focus:outline-none";
const iconBtn =
  "grid h-8 w-8 place-items-center rounded-md border border-walshe-line text-walshe-ink transition-colors hover:bg-walshe-ink/10";

function NumBox({ label, value, onChange, disabled }: { label: string; value: number | undefined; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-0.5 ${disabled ? "opacity-50" : ""}`} title={label}>
      <span className="text-walshe-grey">{label}</span>
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        disabled={disabled}
        aria-label={label}
        className={`h-6 w-12 rounded border border-walshe-line px-1 text-right text-[11px] text-walshe-ink focus:border-walshe-mint focus:outline-none ${
          disabled ? "cursor-not-allowed bg-walshe-stone/60" : "bg-walshe-base"
        }`}
      />
    </label>
  );
}

// A compact dope-sheet: a draggable keyframe track + an editable keyframe list. Editing raw
// keyframes builds a custom track (motion paths etc.) — superseding the entrance preset.
function KeyframeEditor({
  node,
  onAnim,
  sceneDurationMs,
  playheadMs,
  startLocked,
}: {
  node: DesignNode;
  onAnim: Props["onAnim"];
  sceneDurationMs: number;
  playheadMs: number;
  startLocked?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragT = useRef<number | null>(null); // the t of the keyframe currently being dragged
  const kfs = (node.anim?.keyframes ?? []).slice().sort((a, b) => a.t - b.t);
  const dur = Math.max(1, sceneDurationMs);
  // A chained successor's 0s keyframe mirrors the previous sprite's end — it is read-only.
  const isLocked = (t: number) => Boolean(startLocked) && t <= 0;

  function commit(next: AnimKeyframe[]) {
    const sorted = next.slice().sort((a, b) => a.t - b.t);
    const loop = node.anim?.loop;
    onAnim(sorted.length > 0 || loop ? { keyframes: sorted, loop } : undefined);
  }
  function patchKf(i: number, patch: Partial<AnimKeyframe>) {
    commit(kfs.map((k, idx) => (idx === i ? { ...k, ...patch } : k)));
  }
  function timeFromX(clientX: number): number {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return 0;
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * dur);
  }
  function addAt(t: number) {
    const st = nodeStateAt(node, t);
    const kf: AnimKeyframe = {
      t: Math.round(t),
      x: Math.round(st.x),
      y: Math.round(st.y),
      scale: Math.round(st.scale * 100) / 100,
      rotation: Math.round(st.rotation),
      opacity: Math.round(st.opacity * 100) / 100,
      ease: "easeInOut",
    };
    commit([...kfs.filter((k) => Math.abs(k.t - kf.t) > 20), kf]);
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      if (dragT.current === null) return;
      const idx = kfs.findIndex((k) => k.t === dragT.current);
      if (idx < 0) return;
      const t = timeFromX(e.clientX);
      dragT.current = t;
      patchKf(idx, { t });
    }
    function up() {
      dragT.current = null;
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kfs]);

  return (
    <div className="space-y-2 border-t border-walshe-line/70 pt-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Keyframes</span>
        <button
          type="button"
          onClick={() => addAt(playheadMs)}
          className="rounded-md border border-walshe-line px-2 py-1 text-[11px] font-medium text-walshe-ink transition-colors hover:bg-walshe-ink/10"
        >
          + at {(playheadMs / 1000).toFixed(1)}s
        </button>
      </div>
      {startLocked && (
        <p className="flex items-center gap-1 text-[11px] leading-snug text-walshe-grey">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Its start (0s) is locked to the previous sprite’s end.
        </p>
      )}
      {/* Dope-sheet track: diamonds = keyframes (drag to retime); double-click to add; line = playhead. */}
      <div
        ref={trackRef}
        onDoubleClick={(e) => addAt(timeFromX(e.clientX))}
        className="relative h-7 rounded-md border border-walshe-line bg-walshe-stone/40"
      >
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-walshe-teal/70"
          style={{ left: `${(Math.min(playheadMs, dur) / dur) * 100}%` }}
        />
        {kfs.map((k, i) => {
          const locked = isLocked(k.t);
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              title={locked ? "Start locked to the previous sprite’s end" : `${(k.t / 1000).toFixed(2)}s — drag to move`}
              onPointerDown={
                locked
                  ? undefined
                  : (e) => {
                      dragT.current = k.t;
                      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    }
              }
              className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border border-white shadow ${
                locked ? "cursor-not-allowed bg-walshe-grey" : "cursor-ew-resize bg-walshe-teal"
              }`}
              style={{ left: `${(Math.min(k.t, dur) / dur) * 100}%` }}
            />
          );
        })}
      </div>
      {kfs.length === 0 ? (
        <p className="text-[11px] text-walshe-grey">
          Scrub the timeline, then “+ at …” to drop a keyframe (or double-click the track). Move the
          element and add keyframes at different times to build a motion path.
        </p>
      ) : (
        <div className="space-y-1.5">
          {kfs.map((k, i) => {
            const locked = isLocked(k.t);
            return (
              <div key={i} className={`flex items-center gap-1.5 text-[11px] ${locked ? "opacity-60" : ""}`}>
                <span className="w-9 tabular-nums text-walshe-grey">{(k.t / 1000).toFixed(2)}s</span>
                <NumBox label="X" value={k.x} disabled={locked} onChange={(v) => patchKf(i, { x: v })} />
                <NumBox label="Y" value={k.y} disabled={locked} onChange={(v) => patchKf(i, { y: v })} />
                <NumBox label="%" value={Math.round((k.scale ?? 1) * 100)} disabled={locked} onChange={(v) => patchKf(i, { scale: v / 100 })} />
                <NumBox label="°" value={Math.round(k.rotation ?? 0)} disabled={locked} onChange={(v) => patchKf(i, { rotation: v })} />
                {locked ? (
                  <span className="ml-auto grid h-6 w-6 place-items-center text-walshe-grey" title="Start locked to the previous sprite’s end" aria-label="Start locked">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label="Delete keyframe"
                    onClick={() => commit(kfs.filter((_, idx) => idx !== i))}
                    className="ml-auto grid h-6 w-6 place-items-center rounded text-walshe-danger transition-colors hover:bg-walshe-danger/10"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A small chequerboard, shown when a colour is transparent (and on the Transparent toggle).
const CHECKER: React.CSSProperties = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#c9c9c9 25%,transparent 25%),linear-gradient(-45deg,#c9c9c9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#c9c9c9 75%),linear-gradient(-45deg,transparent 75%,#c9c9c9 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
};

function Swatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const transparent = (value ?? "").trim().toLowerCase() === "transparent";
  return (
    <div className="flex items-center gap-1.5">
      {/* The colour picker. Picking any colour clears a transparent value. */}
      <label className="relative inline-grid h-8 w-10 cursor-pointer place-items-center overflow-hidden rounded-md border border-walshe-line">
        <span className="pointer-events-none absolute inset-1 rounded" style={transparent ? CHECKER : { background: value }} />
        <input
          type="color"
          value={/^#([0-9a-f]{6})$/i.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Colour"
        />
      </label>
      {/* Transparent toggle: sets the colour to none (chequerboard = transparent). */}
      <button
        type="button"
        title="Transparent"
        aria-label="Transparent"
        aria-pressed={transparent}
        onClick={() => onChange("transparent")}
        className={`grid h-8 w-8 place-items-center overflow-hidden rounded-md border transition-colors ${
          transparent ? "border-walshe-teal ring-2 ring-walshe-teal/40" : "border-walshe-line hover:bg-walshe-ink/10"
        }`}
      >
        <span className="h-4 w-4 rounded-sm border border-walshe-line" style={CHECKER} />
      </button>
    </div>
  );
}

function Toggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-md border text-small transition-colors ${
        on ? "border-walshe-teal bg-walshe-teal text-white" : "border-walshe-line text-walshe-ink hover:bg-walshe-ink/10"
      }`}
    >
      {children}
    </button>
  );
}

/** The selected-element Inspector: type-specific styling controls + layer/duplicate/delete. */
export default function Inspector({ node, onChange, onDuplicate, onDelete, onLayer, onAnim, sceneDurationMs, playheadMs, startLocked }: Props) {
  if (!node) {
    return <p className="px-1 py-6 text-center text-small text-walshe-grey">Select an element to style it.</p>;
  }
  const isText = node.type === "text";
  const isShape = node.type === "shape";
  const isImage = node.type === "image";

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">
        {isText ? "Text" : isShape ? `Shape · ${node.shape}` : "Image"}
      </p>

      {isText && (
        <>
          <textarea
            value={node.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            aria-label="Text content"
            className="w-full resize-y rounded-md border border-walshe-line bg-walshe-base p-2 text-small text-walshe-ink focus:border-walshe-mint focus:outline-none"
          />
          <div className={row}>
            <span className={label}>Font</span>
            <select
              value={node.fontFamily ?? FONTS[0].value}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
              aria-label="Font family"
              className={`${field} w-40`}
            >
              {FONTS.map((f) => (
                <option key={f.label} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div className={row}>
            <span className={label}>Size</span>
            <input
              type="number"
              min={8}
              max={400}
              value={node.fontSize ?? 48}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) || 48 })}
              aria-label="Font size"
              className={`${field} w-20 text-right`}
            />
          </div>
          <div className={row}>
            <span className={label}>Style</span>
            <div className="flex gap-1.5">
              <Toggle on={node.fontWeight === "bold"} title="Bold" onClick={() => onChange({ fontWeight: node.fontWeight === "bold" ? "normal" : "bold" })}>
                <span className="font-bold">B</span>
              </Toggle>
              <Toggle on={node.fontStyle === "italic"} title="Italic" onClick={() => onChange({ fontStyle: node.fontStyle === "italic" ? "normal" : "italic" })}>
                <span className="italic">I</span>
              </Toggle>
            </div>
          </div>
          <div className={row}>
            <span className={label}>Align</span>
            <div className="flex gap-1.5">
              {(["left", "center", "right"] as const).map((a) => (
                <Toggle key={a} on={(node.textAlign ?? "left") === a} title={a} onClick={() => onChange({ textAlign: a })}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    {a === "left" && <><path d="M4 6h16M4 12h10M4 18h14" /></>}
                    {a === "center" && <><path d="M4 6h16M7 12h10M5 18h14" /></>}
                    {a === "right" && <><path d="M4 6h16M10 12h10M6 18h14" /></>}
                  </svg>
                </Toggle>
              ))}
            </div>
          </div>
        </>
      )}

      {(isText || isShape) && (
        <div className={row}>
          <span className={label}>{isText ? "Colour" : "Fill"}</span>
          <Swatch value={node.color ?? "#111111"} onChange={(v) => onChange({ color: v })} />
        </div>
      )}

      {isShape && (
        <>
          <div className={row}>
            <span className={label}>Outline</span>
            <div className="flex items-center gap-1.5">
              <Swatch value={node.stroke ?? "#000000"} onChange={(v) => onChange({ stroke: v })} />
              <input
                type="number"
                min={0}
                max={40}
                value={node.strokeWidth ?? (node.stroke ? 2 : 0)}
                onChange={(e) => {
                  const w = Number(e.target.value) || 0;
                  onChange(w > 0 ? { strokeWidth: w, stroke: node.stroke ?? "#000000" } : { strokeWidth: 0, stroke: undefined });
                }}
                aria-label="Outline width"
                className={`${field} w-16 text-right`}
              />
            </div>
          </div>
          {node.shape === "rect" && (
            <div className={row}>
              <span className={label}>Corner</span>
              <input
                type="range"
                min={0}
                max={Math.round(Math.min(node.width, node.height) / 2)}
                value={node.radius ?? 0}
                onChange={(e) => onChange({ radius: Number(e.target.value) })}
                aria-label="Corner radius"
                className="w-32"
              />
            </div>
          )}
        </>
      )}

      {isImage && (
        <div className={row}>
          <span className={label}>Corner</span>
          <input
            type="range"
            min={0}
            max={Math.round(Math.min(node.width, node.height) / 2)}
            value={node.radius ?? 0}
            onChange={(e) => onChange({ radius: Number(e.target.value) })}
            aria-label="Corner radius"
            className="w-32"
          />
        </div>
      )}

      <div className={row}>
        <span className={label}>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((node.opacity ?? 1) * 100)}
          onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
          aria-label="Opacity"
          className="w-32"
        />
      </div>

      {isImage && (node.frames?.length ?? 0) > 1 && (
        <div className="space-y-2.5 border-t border-walshe-line/70 pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Sprite</p>
          <label className={`${row} cursor-pointer`}>
            <span className={label}>Loop animation</span>
            <input
              type="checkbox"
              checked={node.loopFrames !== false}
              onChange={(e) => onChange({ loopFrames: e.target.checked })}
              aria-label="Loop sprite animation"
              className="h-4 w-4 accent-walshe-teal"
            />
          </label>
          <div className={row}>
            <span className={label}>Speed (fps)</span>
            <input
              type="range"
              min={1}
              max={24}
              value={node.fps ?? 10}
              onChange={(e) => onChange({ fps: Number(e.target.value) })}
              aria-label="Sprite speed (frames per second)"
              className="w-28"
            />
            <span className="w-8 text-right text-small tabular-nums text-walshe-grey">{node.fps ?? 10}</span>
          </div>
        </div>
      )}

      {isImage && (node.videoKey || node.videoSrc) && (
        <div className="space-y-2.5 border-t border-walshe-line/70 pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">Video</p>
          <div className={row}>
            <span className={label}>Start at (s)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={((node.videoStartMs ?? 0) / 1000).toFixed(1)}
              onChange={(e) =>
                onChange({ videoStartMs: Math.max(0, Math.round((Number(e.target.value) || 0) * 1000)) })
              }
              aria-label="Video start time (seconds)"
              className="field h-8 w-20 text-right tabular-nums"
            />
          </div>
          <p className="text-[11px] leading-snug text-walshe-grey">
            The clip plays from here with the scene and restarts from this point each loop — no drift.
          </p>
        </div>
      )}

      <AnimControls node={node} onAnim={onAnim} />

      <KeyframeEditor node={node} onAnim={onAnim} sceneDurationMs={sceneDurationMs} playheadMs={playheadMs} startLocked={startLocked} />

      <div className="flex items-center justify-between gap-2 border-t border-walshe-line/70 pt-2.5">
        <div className="flex gap-1.5">
          <button type="button" title="Bring to front" className={iconBtn} onClick={() => onLayer("front")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="7" y="7" width="12" height="12" rx="1.5" /><path d="M5 15V5h10" /></svg>
          </button>
          <button type="button" title="Forward" className={iconBtn} onClick={() => onLayer("forward")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M6 11l6-6 6 6" /></svg>
          </button>
          <button type="button" title="Backward" className={iconBtn} onClick={() => onLayer("backward")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M6 13l6 6 6-6" /></svg>
          </button>
          <button type="button" title="Send to back" className={iconBtn} onClick={() => onLayer("back")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="5" width="12" height="12" rx="1.5" /><path d="M19 9v10H9" /></svg>
          </button>
        </div>
        <div className="flex gap-1.5">
          <button type="button" title="Duplicate" className={iconBtn} onClick={onDuplicate}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" /></svg>
          </button>
          <button type="button" title="Delete" className={`${iconBtn} text-walshe-danger hover:bg-walshe-danger/10`} onClick={onDelete}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
