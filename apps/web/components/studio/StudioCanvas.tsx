"use client";

import { useEffect, useRef } from "react";
import { Canvas, Point, Rect, Shadow, type FabricObject, type TPointerEventInfo } from "fabric";
import { nodeToObject } from "../../lib/studio/fabric-nodes";
import type { DesignDoc } from "../../lib/studio/ops";

export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioControls {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

export interface StudioCanvasProps {
  design: DesignDoc;
  pageIndex: number;
  /** Receives the live canvas (for things that need it) once mounted, null on unmount. */
  onReady?: (canvas: Canvas | null) => void;
  /** Called when the user moves/resizes an element — write it back to the design model. */
  onNodeChange?: (nodeId: string, box: NodeBox) => void;
  /** Receives imperative zoom/fit controls for the top bar once mounted. */
  onControls?: (controls: StudioControls) => void;
}

const DOT_BASE = 22; // dot spacing at 100% zoom (px)
const ZOOM_MIN = 0.12;
const ZOOM_MAX = 4;

type TaggedObject = FabricObject & { nodeId?: string };

/**
 * The CorelDraw/n8n-style workspace: a dot-matrix field that pans + zooms, with the artboard drawn
 * as a frame over the dots. The serialisable design model stays the source of truth — we render it
 * onto the canvas, and user moves/resizes are written back through the pure ops (onNodeChange).
 */
export default function StudioCanvas({
  design,
  pageIndex,
  onReady,
  onNodeChange,
  onControls,
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const changeRef = useRef(onNodeChange);
  changeRef.current = onNodeChange;
  const fittedRef = useRef<string>(""); // "w×h" of the last fit, so a new format re-fits

  // Keep the dotted background locked to the canvas viewport transform (pan + zoom).
  function syncDots() {
    const canvas = canvasRef.current;
    const dots = dotsRef.current;
    if (!canvas || !dots) return;
    const [zoom, , , , tx, ty] = canvas.viewportTransform;
    const size = DOT_BASE * zoom;
    dots.style.backgroundSize = `${size}px ${size}px`;
    dots.style.backgroundPosition = `${tx}px ${ty}px`;
  }

  function zoomAt(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, canvas.getZoom() * factor));
    canvas.zoomToPoint(new Point(canvas.getWidth() / 2, canvas.getHeight() / 2), zoom);
    syncDots();
  }

  function fitToView() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const zoom = Math.min(cw / design.width, ch / design.height) * 0.82;
    canvas.setViewportTransform([
      zoom,
      0,
      0,
      zoom,
      (cw - design.width * zoom) / 2,
      (ch - design.height * zoom) / 2,
    ]);
    syncDots();
  }

  // Mount once: create the canvas + wire pan/zoom/selection handlers.
  useEffect(() => {
    const el = elRef.current;
    const container = containerRef.current;
    if (!el || !container) return;
    const canvas = new Canvas(el, {
      width: container.clientWidth,
      height: container.clientHeight,
      selection: true,
      preserveObjectStacking: true,
      backgroundColor: "",
    });
    canvasRef.current = canvas;
    onReady?.(canvas);
    onControls?.({ zoomIn: () => zoomAt(1.2), zoomOut: () => zoomAt(1 / 1.2), fit: fitToView });

    let panning = false;
    let spaceHeld = false;
    let lastX = 0;
    let lastY = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld = true;
        canvas.defaultCursor = "grab";
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld = false;
        canvas.defaultCursor = "default";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    canvas.on("mouse:down", (opt: TPointerEventInfo) => {
      const e = opt.e as MouseEvent;
      if (spaceHeld || e.altKey || e.button === 1) {
        panning = true;
        canvas.selection = false;
        canvas.defaultCursor = "grabbing";
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.on("mouse:move", (opt: TPointerEventInfo) => {
      if (!panning) return;
      const e = opt.e as MouseEvent;
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastX;
      vpt[5] += e.clientY - lastY;
      canvas.setViewportTransform(vpt);
      lastX = e.clientX;
      lastY = e.clientY;
      syncDots();
    });
    canvas.on("mouse:up", () => {
      panning = false;
      canvas.selection = true;
      canvas.defaultCursor = spaceHeld ? "grab" : "default";
    });

    canvas.on("mouse:wheel", (opt: TPointerEventInfo) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) {
        let zoom = canvas.getZoom() * 0.999 ** e.deltaY;
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
        canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      } else {
        const vpt = canvas.viewportTransform;
        vpt[4] -= e.deltaX;
        vpt[5] -= e.deltaY;
        canvas.setViewportTransform(vpt);
      }
      syncDots();
    });

    canvas.on("object:modified", (opt) => {
      const obj = opt.target as TaggedObject | undefined;
      if (!obj || !obj.nodeId) return;
      changeRef.current?.(obj.nodeId, {
        x: Math.round(obj.left ?? 0),
        y: Math.round(obj.top ?? 0),
        width: Math.round(obj.getScaledWidth()),
        height: Math.round(obj.getScaledHeight()),
      });
    });

    const ro = new ResizeObserver(() => {
      canvas.setDimensions({ width: container.clientWidth, height: container.clientHeight });
      syncDots();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      onReady?.(null);
      canvasRef.current = null;
      void canvas.dispose();
    };
    // Mount once; renders happen in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the current design page onto the canvas (artboard frame + nodes), preserving the viewport.
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

      const savedVpt = [...canvas.viewportTransform] as typeof canvas.viewportTransform;
      canvas.remove(...canvas.getObjects());

      // The artboard: a frame over the dotted field (transparent unless a background colour is set).
      const artboard = new Rect({
        left: 0,
        top: 0,
        width: design.width,
        height: design.height,
        fill: page.background ?? "rgba(255,255,255,0)",
        stroke: "#94a3b8",
        strokeWidth: 1,
        strokeUniform: true,
        selectable: false,
        evented: false,
        hoverCursor: "default",
        excludeFromExport: true,
        shadow: new Shadow({ color: "rgba(7,20,24,0.28)", blur: 60, offsetX: 0, offsetY: 24 }),
      });
      canvas.add(artboard);
      objects.forEach((o) => canvas.add(o));

      const key = `${design.width}x${design.height}`;
      if (fittedRef.current !== key) {
        fittedRef.current = key;
        fitToView();
      } else {
        canvas.setViewportTransform(savedVpt);
        syncDots();
      }
      canvas.requestRenderAll();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, pageIndex]);

  return (
    <div
      ref={containerRef}
      data-testid="studio-canvas"
      className="relative h-full w-full overflow-hidden bg-walshe-mist"
    >
      {/* Dot-matrix field behind the (transparent) canvas; kept in sync with the viewport. */}
      <div
        ref={dotsRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgb(var(--walshe-grey) / 0.4) 1.2px, transparent 1.2px)",
          backgroundSize: `${DOT_BASE}px ${DOT_BASE}px`,
        }}
      />
      <canvas ref={elRef} className="relative block" />
    </div>
  );
}
