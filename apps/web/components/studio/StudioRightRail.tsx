"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addGraphic,
  addShape,
  addText,
  setBackground,
  type DesignDoc,
  type ShapeKind,
} from "../../lib/studio/ops";
import {
  ABSTRACT_ARTIFACTS,
  SPRITE_ANIMATIONS,
  STICKERS,
  svgDataUrl,
  type GraphicDef,
  type SpriteDef,
} from "../../lib/studio/graphics";

type Tool = "text" | "shapes" | "background" | "graphics" | "animated";

interface Props {
  design: DesignDoc;
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
}

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: "text", label: "Text", icon: <path d="M5 6h14M12 6v12M8 18h8" /> },
  {
    id: "shapes",
    label: "Shapes",
    icon: (
      <>
        <rect x="3" y="4" width="8" height="8" rx="1.5" />
        <circle cx="16" cy="16" r="4.5" />
      </>
    ),
  },
  {
    id: "background",
    label: "Background",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 15l5-5 4 4 3-3 6 6" />
      </>
    ),
  },
  {
    id: "graphics",
    label: "Graphics",
    icon: (
      <>
        <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />
      </>
    ),
  },
  {
    id: "animated",
    label: "Animated",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
  },
];

const chip =
  "inline-flex items-center gap-1.5 rounded-md border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small font-medium text-walshe-ink transition-colors hover:border-walshe-ink/30 hover:bg-walshe-ink/10";

// A labelled grid of SVG thumbnails (artifacts / stickers / sprites). Clicking inserts the item.
function GraphicGrid({ title, items, onPick }: { title: string; items: readonly GraphicDef[]; onPick: (g: GraphicDef) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-walshe-grey">{title}</p>
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g)}
            title={g.label}
            aria-label={`Add ${g.label}`}
            className="grid aspect-square place-items-center rounded-md border border-walshe-line bg-walshe-stone/40 p-1.5 transition-colors hover:border-walshe-teal hover:bg-walshe-ink/5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={svgDataUrl(g.svg)} alt={g.label} className="h-full w-full object-contain" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}

// Add-text presets so a click drops a sensibly-styled text block (Canva-style).
const TEXT_PRESETS: { label: string; text: string; size: number; weight: "bold" | "normal" }[] = [
  { label: "Heading", text: "Heading", size: 88, weight: "bold" },
  { label: "Subheading", text: "Subheading", size: 48, weight: "bold" },
  { label: "Body text", text: "Body text", size: 30, weight: "normal" },
];

const SHAPE_ICON: Record<ShapeKind, ReactNode> = {
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  line: <line x1="4" y1="18" x2="20" y2="6" />,
};

/**
 * The studio's right tool rail: a compact vertical icon bar of creation tools only (Text, Shapes,
 * Background). Each icon shows its name on hover and opens a small popover to its left. Format/size
 * and Export live in the always-showing top bar; brand personalisation lives in the Brand kit.
 */
export default function StudioRightRail({ design, sceneIndex, onChange }: Props) {
  const [active, setActive] = useState<Tool | null>(null);
  const [bg, setBg] = useState("#ffffff");
  const rootRef = useRef<HTMLDivElement>(null);
  const activeTool = TOOLS.find((t) => t.id === active);

  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setActive(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [active]);

  return (
    <div ref={rootRef} className="pointer-events-auto absolute right-3 top-24 z-30 flex items-start gap-2">
      {activeTool && (
        <div className="w-64 rounded-xl border border-walshe-line/70 bg-chrome-bg/95 p-4 shadow-xl backdrop-blur-md">
          <h2 className="mb-3 text-small font-bold text-walshe-ink">{activeTool.label}</h2>

          {active === "text" && (
            <div className="flex flex-col gap-2">
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`${chip} justify-start`}
                  onClick={() =>
                    onChange(
                      addText(design, sceneIndex, p.text, { fontSize: p.size, fontWeight: p.weight, width: 640 }),
                    )
                  }
                >
                  <span style={{ fontSize: Math.min(22, p.size / 4), fontWeight: p.weight }}>{p.label}</span>
                </button>
              ))}
            </div>
          )}

          {active === "shapes" && (
            <div className="flex flex-wrap gap-2">
              {(["rect", "ellipse", "line"] as ShapeKind[]).map((s) => (
                <button key={s} type="button" className={chip} onClick={() => onChange(addShape(design, sceneIndex, s))}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    {SHAPE_ICON[s]}
                  </svg>
                  {s}
                </button>
              ))}
            </div>
          )}

          {active === "background" && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                aria-label="Background colour"
                className="h-9 w-10 cursor-pointer rounded-md border border-walshe-line p-0.5"
              />
              <button type="button" className={chip} onClick={() => onChange(setBackground(design, sceneIndex, bg))}>
                Apply
              </button>
              <button
                type="button"
                className={chip}
                onClick={() => onChange(setBackground(design, sceneIndex, ""))}
                title="Clear background"
              >
                Clear
              </button>
            </div>
          )}

          {active === "graphics" && (
            <div className="space-y-3">
              <GraphicGrid
                title="Abstract"
                items={ABSTRACT_ARTIFACTS}
                onPick={(g) => onChange(addGraphic(design, sceneIndex, { src: svgDataUrl(g.svg), width: g.width, height: g.height }))}
              />
              <GraphicGrid
                title="Stickers"
                items={STICKERS}
                onPick={(g) => onChange(addGraphic(design, sceneIndex, { src: svgDataUrl(g.svg), width: g.width, height: g.height }))}
              />
            </div>
          )}

          {active === "animated" && (
            <GraphicGrid
              title="Sprite animations"
              items={SPRITE_ANIMATIONS}
              onPick={(g) => {
                const s = g as SpriteDef;
                // Insert as a frame-by-frame sprite: its filmstrip plays on preview + export.
                onChange(addGraphic(design, sceneIndex, { width: s.width, height: s.height, frames: s.frames, fps: s.fps }));
              }}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-xl border border-walshe-line/70 bg-chrome-bg/90 p-1.5 shadow-xl backdrop-blur-md">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            title={t.label}
            aria-pressed={active === t.id}
            onClick={() => setActive((cur) => (cur === t.id ? null : t.id))}
            className={`group relative grid h-11 w-11 place-items-center rounded-lg transition-colors ${
              active === t.id ? "bg-walshe-teal text-white" : "text-walshe-ink hover:bg-walshe-ink/10"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {t.icon}
            </svg>
            {/* Hover tooltip (the name) to the left of the icon. */}
            <span className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-walshe-deep px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow transition-opacity group-hover:opacity-100">
              {t.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
