"use client";

import { useState, type ReactNode } from "react";
import {
  addCatalogImage,
  addShape,
  addText,
  setBackground,
  type DesignDoc,
  type ShapeKind,
} from "../../lib/studio/ops";

export interface CatalogImageOption {
  catalogItemId: string;
  label: string;
  src: string;
}

interface Props {
  design: DesignDoc;
  /** index of the active scene new content lands on */
  sceneIndex: number;
  onChange: (next: DesignDoc) => void;
  catalogImages?: readonly CatalogImageOption[];
}

// Light editor toolbar (Canva-style): compact outlined chips on the white tool bar.
const btn =
  "inline-flex items-center gap-1.5 rounded-sm border border-walshe-line bg-walshe-stone/60 px-3 py-2 text-small font-medium text-walshe-ink transition-colors hover:border-walshe-ink/30 hover:bg-walshe-ink/10 disabled:cursor-not-allowed disabled:opacity-50";

// Small, descriptive label that heads each control group.
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-walshe-grey">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="hidden h-9 w-px self-end bg-walshe-line sm:block" />;
}

const SHAPE_ICON: Record<ShapeKind, ReactNode> = {
  rect: <rect x="4" y="6" width="16" height="12" rx="1.5" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  line: <line x1="4" y1="18" x2="20" y2="6" />,
};

function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      {SHAPE_ICON[kind]}
    </svg>
  );
}

export default function Toolbar({ design, sceneIndex, onChange, catalogImages = [] }: Props) {
  const [text, setText] = useState("New text");
  const [bg, setBg] = useState("#fef3c7");

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3" role="toolbar" aria-label="Design tools">
      <Group label="Text">
        <input
          aria-label="Text content"
          className="h-9 w-36 rounded-sm border border-walshe-line bg-walshe-stone/60 px-2.5 text-small text-walshe-ink placeholder:text-walshe-grey focus:border-walshe-mint"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="button" className={btn} onClick={() => onChange(addText(design, sceneIndex, text))}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M5 6h14M12 6v12M8 18h8" />
          </svg>
          Add text
        </button>
      </Group>

      <Divider />

      <Group label="Shapes">
        {(["rect", "ellipse", "line"] as ShapeKind[]).map((s) => (
          <button key={s} type="button" className={btn} onClick={() => onChange(addShape(design, sceneIndex, s))}>
            <ShapeGlyph kind={s} />
            Add {s}
          </button>
        ))}
      </Group>

      <Divider />

      <Group label="Background">
        <input
          aria-label="Background colour"
          type="color"
          value={bg}
          onChange={(e) => setBg(e.target.value)}
          className="h-9 w-9 cursor-pointer rounded-sm border border-walshe-line bg-walshe-stone/60 p-0.5"
        />
        <button type="button" className={btn} onClick={() => onChange(setBackground(design, sceneIndex, bg))}>
          Set background
        </button>
      </Group>

      {catalogImages.length > 0 && (
        <>
          <Divider />
          <Group label="Images">
            {catalogImages.map((img) => (
              <button
                key={img.catalogItemId}
                type="button"
                className={btn}
                onClick={() =>
                  onChange(addCatalogImage(design, sceneIndex, { src: img.src, catalogItemId: img.catalogItemId }))
                }
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="8.5" cy="9.5" r="1.5" />
                  <path d="M21 16l-5-5-6 6" />
                </svg>
                Add image: {img.label}
              </button>
            ))}
          </Group>
        </>
      )}

    </div>
  );
}
