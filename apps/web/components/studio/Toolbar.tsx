"use client";

import { useState } from "react";
import {
  addCatalogImage,
  addPage,
  addShape,
  addText,
  setBackground,
  type DesignDoc,
  type ShapeKind,
} from "../../lib/studio/ops";
import { getFormatPreset } from "../../lib/studio/formats";

export interface CatalogImageOption {
  catalogItemId: string;
  label: string;
  src: string;
}

interface Props {
  design: DesignDoc;
  pageIndex: number;
  onChange: (next: DesignDoc) => void;
  onPageChange: (pageIndex: number) => void;
  catalogImages?: readonly CatalogImageOption[];
}

const btn = "rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100";

export default function Toolbar({ design, pageIndex, onChange, onPageChange, catalogImages = [] }: Props) {
  const [text, setText] = useState("New text");
  const [bg, setBg] = useState("#fef3c7");
  const multi = getFormatPreset(design.format).multiPage;

  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Design tools">
      <input
        aria-label="Text content"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className={btn} onClick={() => onChange(addText(design, pageIndex, text))}>
        Add text
      </button>
      {(["rect", "ellipse", "line"] as ShapeKind[]).map((s) => (
        <button key={s} type="button" className={btn} onClick={() => onChange(addShape(design, pageIndex, s))}>
          Add {s}
        </button>
      ))}
      <input aria-label="Background colour" type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
      <button type="button" className={btn} onClick={() => onChange(setBackground(design, pageIndex, bg))}>
        Set background
      </button>
      {catalogImages.map((img) => (
        <button
          key={img.catalogItemId}
          type="button"
          className={btn}
          onClick={() =>
            onChange(addCatalogImage(design, pageIndex, { src: img.src, catalogItemId: img.catalogItemId }))
          }
        >
          Add image: {img.label}
        </button>
      ))}
      {multi && (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => {
              const next = addPage(design);
              onChange(next);
              onPageChange(next.pages.length - 1);
            }}
          >
            Add page
          </button>
          <span className="text-sm">
            Page {pageIndex + 1}/{design.pages.length}
          </span>
          <button type="button" className={btn} disabled={pageIndex === 0} onClick={() => onPageChange(pageIndex - 1)}>
            Prev
          </button>
          <button
            type="button"
            className={btn}
            disabled={pageIndex >= design.pages.length - 1}
            onClick={() => onPageChange(pageIndex + 1)}
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
