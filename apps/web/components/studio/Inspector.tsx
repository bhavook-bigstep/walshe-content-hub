"use client";

import { useEffect, useState } from "react";
import { enterTrack } from "../../lib/studio/anim";
import {
  EASINGS,
  ENTER_TYPES,
  type DesignNode,
  type Easing,
  type EnterType,
  type LayerMove,
  type NodeAnimation,
  type NodeStyle,
} from "../../lib/studio/ops";

// Web-safe / default-stack families so the canvas (and PNG export) actually render them.
const FONTS: { label: string; value: string }[] = [
  { label: "Sans (Inter)", value: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Serif", value: "Georgia, 'Times New Roman', serif" },
  { label: "Display", value: "'Arial Black', Impact, sans-serif" },
  { label: "Rounded", value: "'Trebuchet MS', Verdana, sans-serif" },
  { label: "Mono", value: "'Courier New', ui-monospace, monospace" },
];

interface Props {
  node: DesignNode | null;
  onChange: (patch: Partial<NodeStyle>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLayer: (move: LayerMove) => void;
  /** Set (or clear) the selected element's keyframe animation. */
  onAnim: (anim: NodeAnimation | undefined) => void;
}

const ENTER_LABEL: Record<EnterType | "none", string> = {
  none: "None",
  fade: "Fade in",
  rise: "Rise up",
  "slide-left": "Slide in ←",
  "slide-right": "Slide in →",
  scale: "Scale up",
};

// Per-element animation: an entrance preset (type · start · duration · easing) + an emphasis loop.
// Writes a NodeAnimation; the engine expands the entrance into keyframes and plays it.
function AnimControls({ node, onAnim }: { node: DesignNode; onAnim: Props["onAnim"] }) {
  const a = node.anim;
  const [enter, setEnter] = useState<EnterType | "none">(a?.enter?.type ?? "none");
  const [start, setStart] = useState(a?.enter?.startMs ?? 0);
  const [dur, setDur] = useState(a?.enter?.durationMs ?? 500);
  const [ez, setEz] = useState<Easing>(a?.enter?.ease ?? "easeOut");
  const [loop, setLoop] = useState<"none" | "pulse" | "bob">(a?.loop?.type ?? "none");
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

  function emit(next: Partial<{ enter: EnterType | "none"; start: number; dur: number; ez: Easing; loop: "none" | "pulse" | "bob"; period: number }>) {
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
        <span className={label}>Emphasis</span>
        <select value={loop} onChange={(e) => { const v = e.target.value as "none" | "pulse" | "bob"; setLoop(v); emit({ loop: v }); }}
          aria-label="Emphasis loop" className={`${field} w-36`}>
          <option value="none">None</option>
          <option value="pulse">Pulse</option>
          <option value="bob">Bob</option>
        </select>
      </div>
    </div>
  );
}

const row = "flex items-center justify-between gap-2 py-1.5";
const label = "text-[11px] font-semibold uppercase tracking-wide text-walshe-grey";
const field =
  "h-8 rounded-md border border-walshe-line bg-walshe-base px-2 text-small text-walshe-ink focus:border-walshe-mint focus:outline-none";
const iconBtn =
  "grid h-8 w-8 place-items-center rounded-md border border-walshe-line text-walshe-ink transition-colors hover:bg-walshe-ink/10";

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
export default function Inspector({ node, onChange, onDuplicate, onDelete, onLayer, onAnim }: Props) {
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

      <AnimControls node={node} onAnim={onAnim} />

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
