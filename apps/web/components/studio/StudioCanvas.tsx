"use client";

import { useEffect, useRef } from "react";
import { Canvas, Ellipse, FabricImage, Line, Rect, Textbox, type FabricObject } from "fabric";
import type { DesignDoc, DesignNode } from "../../lib/studio/ops";

export interface StudioCanvasProps {
  design: DesignDoc;
  pageIndex: number;
  /** Receives the live canvas (for export) once mounted, null on unmount. */
  onReady?: (canvas: Canvas | null) => void;
  /** Max CSS display width; the backing canvas stays at full design resolution. */
  displayWidth?: number;
}

async function nodeToObject(n: DesignNode): Promise<FabricObject | null> {
  const base = { left: n.x, top: n.y };
  const color = n.color ?? "#111111";
  if (n.type === "text") {
    return new Textbox(n.text ?? "", { ...base, width: n.width, fill: color, fontSize: 48 });
  }
  if (n.type === "shape") {
    if (n.shape === "ellipse") return new Ellipse({ ...base, rx: n.width / 2, ry: n.height / 2, fill: color });
    if (n.shape === "line") {
      return new Line([n.x, n.y, n.x + n.width, n.y + n.height], { stroke: color, strokeWidth: 4 });
    }
    return new Rect({ ...base, width: n.width, height: n.height, fill: color });
  }
  if (n.type === "image" && n.src) {
    try {
      const img = await FabricImage.fromURL(n.src, { crossOrigin: "anonymous" });
      img.set({ ...base, scaleX: n.width / (img.width || n.width), scaleY: n.height / (img.height || n.height) });
      return img;
    } catch {
      return null;
    }
  }
  return null;
}

/** Fabric view of a DesignDoc page. The pure design model stays the source of truth. */
export default function StudioCanvas({ design, pageIndex, onReady, displayWidth = 560 }: StudioCanvasProps) {
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const canvas = new Canvas(elRef.current, { width: design.width, height: design.height, selection: false });
    canvasRef.current = canvas;
    onReady?.(canvas);
    return () => {
      onReady?.(null);
      canvasRef.current = null;
      void canvas.dispose();
    };
    // Mount once; design changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const page = design.pages[pageIndex];
    if (!canvas || !page) return;
    let cancelled = false;
    (async () => {
      const objects = (await Promise.all(page.nodes.map(nodeToObject))).filter(
        (o): o is FabricObject => o !== null,
      );
      if (cancelled || canvasRef.current !== canvas) return;
      canvas.clear();
      canvas.setDimensions({ width: design.width, height: design.height });
      const scale = Math.min(1, displayWidth / design.width);
      canvas.setDimensions(
        { width: Math.round(design.width * scale), height: Math.round(design.height * scale) },
        { cssOnly: true },
      );
      canvas.backgroundColor = page.background ?? "#ffffff";
      objects.forEach((o) => canvas.add(o));
      canvas.requestRenderAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [design, pageIndex, displayWidth]);

  return (
    <div
      data-testid="studio-canvas"
      className="inline-block overflow-hidden rounded-md bg-white shadow-lift ring-1 ring-walshe-line"
    >
      <canvas ref={elRef} className="block" />
    </div>
  );
}
