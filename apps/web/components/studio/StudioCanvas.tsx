"use client";

import { useEffect, useRef } from "react";
import {
  Canvas,
  FabricText,
  Line,
  Point,
  Rect,
  Shadow,
  Triangle,
  type FabricObject,
  type TPointerEventInfo,
} from "fabric";
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
  /** the scene whose content is editable + highlighted */
  activeScene: number;
  /** Receives the live canvas (for things that need it) once mounted, null on unmount. */
  onReady?: (canvas: Canvas | null) => void;
  /** Called when the user moves/resizes an element — write it back to the design model. */
  onNodeChange?: (sceneIndex: number, nodeId: string, box: NodeBox) => void;
  /** Called when the user clicks a scene on the canvas — make it active. */
  onSelectScene?: (sceneIndex: number) => void;
  /** Receives imperative zoom/fit controls for the top bar once mounted. */
  onControls?: (controls: StudioControls) => void;
}

const DOT_BASE = 22; // dot spacing at 100% zoom (px)
const ZOOM_MIN = 0.04;
const ZOOM_MAX = 4;
const SCENE_GAP = 160; // scene-space px between consecutive artboards

type TaggedObject = FabricObject & { nodeId?: string; sceneIndex?: number };

/** Left edge (scene-space x) of scene i, laid out left-to-right with a fixed gap. */
function sceneOriginX(design: DesignDoc, i: number): number {
  return i * (design.width + SCENE_GAP);
}

/** Total scene-space width spanned by every artboard + the gaps between them. */
function storyboardWidth(design: DesignDoc): number {
  const n = design.scenes.length;
  return n * design.width + Math.max(0, n - 1) * SCENE_GAP;
}

/**
 * The CorelDraw/n8n-style storyboard workspace: a dot-matrix field that pans + zooms, holding one
 * artboard per scene laid out in sequence with connector arrows. The serialisable design model
 * stays the source of truth — we render it onto the canvas, and user moves/resizes on the active
 * scene are written back through the pure ops (onNodeChange).
 */
export default function StudioCanvas({
  design,
  activeScene,
  onReady,
  onNodeChange,
  onSelectScene,
  onControls,
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const changeRef = useRef(onNodeChange);
  changeRef.current = onNodeChange;
  const selectRef = useRef(onSelectScene);
  selectRef.current = onSelectScene;
  const designRef = useRef(design);
  designRef.current = design;
  const fittedRef = useRef<string>(""); // layout signature of the last fit, so a new layout re-fits

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
    const design = designRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const totalW = storyboardWidth(design);
    const zoom = Math.min(cw / totalW, ch / design.height) * 0.86;
    canvas.setViewportTransform([
      zoom,
      0,
      0,
      zoom,
      (cw - totalW * zoom) / 2,
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
        return;
      }
      // A plain click anywhere selects the scene under the pointer (scene-space x band).
      const pt = canvas.getScenePoint(opt.e);
      const design = designRef.current;
      const step = design.width + SCENE_GAP;
      const i = Math.floor(pt.x / step);
      if (i >= 0 && i < design.scenes.length && pt.x - i * step <= design.width) {
        selectRef.current?.(i);
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
      if (!obj || !obj.nodeId || obj.sceneIndex === undefined) return;
      const originX = sceneOriginX(designRef.current, obj.sceneIndex);
      changeRef.current?.(obj.sceneIndex, obj.nodeId, {
        x: Math.round((obj.left ?? 0) - originX),
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

  // Render every scene (artboard frame + nodes + connectors) onto the canvas, preserving viewport.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    (async () => {
      // Build each scene's node objects, offset into its scene-space band.
      const perScene = await Promise.all(
        design.scenes.map(async (scene, i) => {
          const originX = sceneOriginX(design, i);
          const objs = (await Promise.all(scene.nodes.map(nodeToObject))).filter(
            (o): o is FabricObject => o !== null,
          );
          objs.forEach((o) => {
            const t = o as TaggedObject;
            t.left = (t.left ?? 0) + originX;
            t.sceneIndex = i;
            const editable = i === activeScene;
            t.selectable = editable;
            t.evented = editable;
            t.hoverCursor = editable ? "move" : "default";
          });
          return objs;
        }),
      );
      if (cancelled || canvasRef.current !== canvas) return;

      const savedVpt = [...canvas.viewportTransform] as typeof canvas.viewportTransform;
      canvas.remove(...canvas.getObjects());

      design.scenes.forEach((scene, i) => {
        const originX = sceneOriginX(design, i);
        const active = i === activeScene;
        // Artboard frame: transparent unless a background colour is set, so the dots show through.
        const artboard = new Rect({
          left: originX,
          top: 0,
          width: design.width,
          height: design.height,
          fill: scene.background ?? "rgba(255,255,255,0)",
          stroke: active ? "#0f766e" : "#94a3b8",
          strokeWidth: active ? 3 : 1,
          strokeUniform: true,
          selectable: false,
          evented: false,
          hoverCursor: "default",
          excludeFromExport: true,
          shadow: new Shadow({ color: "rgba(7,20,24,0.28)", blur: 60, offsetX: 0, offsetY: 24 }),
        });
        canvas.add(artboard);
        perScene[i].forEach((o) => canvas.add(o));

        // Caption under each artboard: "Scene 1 · 4.0s · fade".
        const label = new FabricText(
          `${scene.name} · ${(scene.durationMs / 1000).toFixed(1)}s · ${scene.transition}`,
          {
            left: originX,
            top: design.height + 28,
            fontSize: 30,
            fontFamily: "sans-serif",
            fill: active ? "#0f766e" : "#64748b",
            selectable: false,
            evented: false,
            excludeFromExport: true,
          },
        );
        canvas.add(label);

        // Connector arrow to the next scene (the auto-sequential chain).
        if (i < design.scenes.length - 1) {
          const y = design.height / 2;
          const x1 = originX + design.width;
          const x2 = originX + design.width + SCENE_GAP;
          const line = new Line([x1, y, x2 - 26, y], {
            stroke: "#94a3b8",
            strokeWidth: 4,
            selectable: false,
            evented: false,
            excludeFromExport: true,
          });
          const head = new Triangle({
            left: x2 - 26,
            top: y - 13,
            width: 26,
            height: 26,
            angle: 90,
            fill: "#94a3b8",
            selectable: false,
            evented: false,
            excludeFromExport: true,
          });
          canvas.add(line, head);
        }
      });

      const key = `${design.width}x${design.height}x${design.scenes.length}`;
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
  }, [design, activeScene]);

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
