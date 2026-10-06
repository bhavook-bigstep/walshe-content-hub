"use client";

import { useEffect, useRef } from "react";
import {
  ActiveSelection,
  Canvas,
  FabricText,
  Line,
  Point,
  Rect,
  Shadow,
  Triangle,
  util,
  type FabricObject,
  type TPointerEventInfo,
} from "fabric";
import { nodeToObject } from "../../lib/studio/fabric-nodes";
import { shouldDeleteSelection } from "../../lib/studio/keys";
import { nodeStateAt } from "../../lib/studio/anim";
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
  /** Map a viewport (clientX/clientY) point to the active scene's local coordinates, for drop
   * placement from the media drawer. Returns null before the canvas has mounted. */
  clientToScenePoint: (clientX: number, clientY: number) => { x: number; y: number } | null;
  /** Preview the active scene's animation at time `t` ms (imperative, no React re-render). Pass
   * null to restore the static/editable layout. Used by the timeline play/scrub. */
  previewAt: (timeMs: number | null) => void;
}

export interface StudioCanvasProps {
  design: DesignDoc;
  /** the scene whose content is editable + highlighted */
  activeScene: number;
  /** Receives the live canvas (for things that need it) once mounted, null on unmount. */
  onReady?: (canvas: Canvas | null) => void;
  /** Called when the user moves/resizes an element — write it back to the design model. */
  onNodeChange?: (sceneIndex: number, nodeId: string, box: NodeBox) => void;
  /** Called when the user deletes selected elements (Delete/Backspace). */
  onNodeDelete?: (sceneIndex: number, nodeId: string) => void;
  /** Called when the user clicks a scene on the canvas — make it active. */
  onSelectScene?: (sceneIndex: number) => void;
  /** Called when the user clicks the empty workspace (outside every artboard) — deselect. */
  onBackgroundClick?: () => void;
  /** Whether a scene is currently selected — when false, no artboard is highlighted. */
  highlightActive?: boolean;
  /** Called when the selection changes — the selected node ids (empty when cleared), plus the
   * scene they're on. One id = single element; many = a group / multi-selection. */
  onSelect?: (sceneIndex: number | null, nodeIds: string[]) => void;
  /** The node id currently selected in the app — re-selected after a rebuild so the Inspector
   * persists across edits (a programmatic rebuild otherwise clears the Fabric selection). */
  selectedNodeId?: string | null;
  /** Reports the active scene's on-screen rectangle (container-relative px) as the canvas pans /
   * zooms / rebuilds, so per-scene controls can anchor to the scene's edges. Null on unmount. */
  onActiveSceneRect?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  /** Called when the user finishes editing a text node inline (double-click → type → blur). */
  onTextEdit?: (sceneIndex: number, nodeId: string, text: string) => void;
  /** Receives imperative zoom/fit controls for the top bar once mounted. */
  onControls?: (controls: StudioControls) => void;
}

const DOT_BASE = 26; // dot spacing at 100% zoom (px) — a touch wider than before so it reads cleaner
const DOT_MIN_PX = 18; // floor on-screen dot spacing so a zoomed-out view isn't clouded
const ZOOM_MIN = 0.04;
const ZOOM_MAX = 4;
const SCENE_GAP = 160; // scene-space px between consecutive artboards
const CLICK_SLOP_PX = 3; // pointer travel under this counts as a click (select), not a drag (pan)

type TaggedObject = FabricObject & {
  nodeId?: string;
  sceneIndex?: number;
  groupId?: string;
  // Base transform captured at build time, so the animation preview can compute animated = base × state.
  baseLeft?: number;
  baseTop?: number;
  baseScaleX?: number;
  baseScaleY?: number;
  baseAngle?: number;
  baseOpacity?: number;
};

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
  onNodeDelete,
  onSelectScene,
  onSelect,
  onTextEdit,
  onControls,
  selectedNodeId,
  onActiveSceneRect,
  onBackgroundClick,
  highlightActive = true,
}: StudioCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const changeRef = useRef(onNodeChange);
  changeRef.current = onNodeChange;
  const deleteRef = useRef(onNodeDelete);
  deleteRef.current = onNodeDelete;
  const selectNodeRef = useRef(onSelect);
  selectNodeRef.current = onSelect;
  const textEditRef = useRef(onTextEdit);
  textEditRef.current = onTextEdit;
  const selectRef = useRef(onSelectScene);
  selectRef.current = onSelectScene;
  const bgClickRef = useRef(onBackgroundClick);
  bgClickRef.current = onBackgroundClick;
  const designRef = useRef(design);
  designRef.current = design;
  const activeSceneRef = useRef(activeScene);
  activeSceneRef.current = activeScene;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const sceneRectRef = useRef(onActiveSceneRect);
  sceneRectRef.current = onActiveSceneRect;
  // True while the render effect rebuilds the canvas, so the intermediate selection:cleared (from
  // removing objects) does not propagate and clear the app's selection / hide the Inspector.
  const suppressSelRef = useRef(false);
  const fittedRef = useRef<string>(""); // layout signature of the last fit, so a new layout re-fits

  // Keep the dotted background locked to the canvas viewport transform (pan + zoom).
  function syncDots() {
    const canvas = canvasRef.current;
    const dots = dotsRef.current;
    if (!canvas || !dots) return;
    const [zoom, , , , tx, ty] = canvas.viewportTransform;
    const size = Math.max(DOT_MIN_PX, DOT_BASE * zoom);
    dots.style.backgroundSize = `${size}px ${size}px`;
    dots.style.backgroundPosition = `${tx}px ${ty}px`;
    // Test signals: the Fabric canvas is opaque to the DOM, so e2e reads pan/zoom (and entity
    // count, set in the render effect) from these data-* attributes.
    const c = containerRef.current;
    if (c) {
      c.dataset.zoom = zoom.toFixed(3);
      c.dataset.pan = `${Math.round(tx)},${Math.round(ty)}`;
    }
    reportSceneRect();
  }

  // Report the active scene's on-screen rect (container px) so per-scene controls can hug its edges.
  function reportSceneRect() {
    const canvas = canvasRef.current;
    const cb = sceneRectRef.current;
    if (!canvas || !cb) return;
    const design = designRef.current;
    const i = activeSceneRef.current;
    if (!design.scenes[i]) {
      cb(null);
      return;
    }
    const [zoom, , , , tx, ty] = canvas.viewportTransform;
    const originX = sceneOriginX(design, i);
    cb({ left: originX * zoom + tx, top: ty, width: design.width * zoom, height: design.height * zoom });
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
    onControls?.({
      zoomIn: () => zoomAt(1.2),
      zoomOut: () => zoomAt(1 / 1.2),
      fit: fitToView,
      clientToScenePoint: (clientX, clientY) => {
        const c = canvasRef.current;
        const cont = containerRef.current;
        if (!c || !cont) return null;
        const rect = cont.getBoundingClientRect();
        const [zoom, , , , tx, ty] = c.viewportTransform;
        const gx = (clientX - rect.left - tx) / zoom;
        const gy = (clientY - rect.top - ty) / zoom;
        return { x: gx - sceneOriginX(designRef.current, activeSceneRef.current), y: gy };
      },
      previewAt: (timeMs) => {
        const c = canvasRef.current;
        if (!c) return;
        const design = designRef.current;
        const active = activeSceneRef.current;
        const originX = sceneOriginX(design, active);
        const scene = design.scenes[active];
        for (const obj of c.getObjects() as TaggedObject[]) {
          if (obj.sceneIndex !== active || !obj.nodeId) continue;
          const node = scene?.nodes.find((n) => n.id === obj.nodeId);
          if (!node) continue;
          if (timeMs === null) {
            obj.set({
              left: obj.baseLeft,
              top: obj.baseTop,
              scaleX: obj.baseScaleX,
              scaleY: obj.baseScaleY,
              angle: obj.baseAngle,
              opacity: obj.baseOpacity,
            });
            obj.selectable = true;
            obj.evented = true;
          } else {
            const st = nodeStateAt(node, timeMs);
            obj.set({
              left: originX + st.x,
              top: st.y,
              scaleX: (obj.baseScaleX ?? 1) * st.scale,
              scaleY: (obj.baseScaleY ?? 1) * st.scale,
              angle: st.rotation,
              opacity: st.opacity,
            });
            obj.selectable = false;
            obj.evented = false;
          }
          obj.setCoords();
        }
        if (timeMs !== null) c.discardActiveObject();
        c.requestRenderAll();
      },
    });

    let panning = false;
    let spaceHeld = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let downX = 0;
    let downY = 0;

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
    // Delete / Backspace removes the selected entities — unless an input or inline text edit is focused.
    const onDeleteKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const targets = canvas.getActiveObjects() as TaggedObject[];
      const ok = shouldDeleteSelection({
        key: e.key,
        activeTag: ae?.tagName ?? null,
        isContentEditable: !!ae?.isContentEditable,
        editing: targets.some((o) => (o as { isEditing?: boolean }).isEditing),
        targetCount: targets.length,
      });
      if (!ok) return;
      e.preventDefault();
      canvas.discardActiveObject();
      for (const obj of targets) {
        if (obj.nodeId && obj.sceneIndex !== undefined) deleteRef.current?.(obj.sceneIndex, obj.nodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onDeleteKey);

    // Pan by dragging empty canvas (or with space / alt / middle button); drag an element to move it.
    canvas.on("mouse:down", (opt: TPointerEventInfo) => {
      const e = opt.e as MouseEvent;
      downX = e.clientX;
      downY = e.clientY;
      const onEmpty = !opt.target; // artboards + inactive scenes are non-evented → count as empty
      if (spaceHeld || e.altKey || e.button === 1 || (e.button === 0 && onEmpty)) {
        panning = true;
        moved = false;
        canvas.selection = false;
        canvas.defaultCursor = "grabbing";
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    canvas.on("mouse:move", (opt: TPointerEventInfo) => {
      if (!panning) return;
      const e = opt.e as MouseEvent;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > CLICK_SLOP_PX) moved = true;
      const vpt = canvas.viewportTransform;
      vpt[4] += e.clientX - lastX;
      vpt[5] += e.clientY - lastY;
      canvas.setViewportTransform(vpt);
      lastX = e.clientX;
      lastY = e.clientY;
      syncDots();
    });
    canvas.on("mouse:up", (opt: TPointerEventInfo) => {
      const wasPanning = panning;
      panning = false;
      canvas.selection = true;
      canvas.defaultCursor = spaceHeld ? "grab" : "default";
      // A click on empty canvas (pan that never moved) selects the scene under the pointer, or
      // deselects when the click lands outside every artboard.
      if (wasPanning && !moved) {
        const pt = canvas.getScenePoint(opt.e);
        const design = designRef.current;
        const step = design.width + SCENE_GAP;
        const i = Math.floor(pt.x / step);
        const onArtboard =
          i >= 0 &&
          i < design.scenes.length &&
          pt.x - i * step <= design.width &&
          pt.y >= 0 &&
          pt.y <= design.height;
        if (onArtboard) selectRef.current?.(i);
        else bgClickRef.current?.();
      }
    });

    // Wheel zooms to the cursor — works for a mouse wheel and a trackpad pinch (ctrl+wheel) alike.
    canvas.on("mouse:wheel", (opt: TPointerEventInfo) => {
      const e = opt.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      let zoom = canvas.getZoom() * 0.999 ** e.deltaY;
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
      canvas.zoomToPoint(new Point(e.offsetX, e.offsetY), zoom);
      syncDots();
    });

    // Report the selected node so the Inspector can edit it. Ignored while the canvas is being
    // rebuilt (the selection is restored afterwards), so edits never flicker the Inspector away.
    const reportSelection = () => {
      if (suppressSelRef.current) return;
      const objs = canvas.getActiveObjects() as TaggedObject[];
      if (objs.length === 0) {
        selectNodeRef.current?.(null, []);
        return;
      }
      // Clicking one member of a group selects the whole group (so it moves/animates together).
      if (objs.length === 1 && objs[0].groupId && objs[0].sceneIndex !== undefined) {
        const gid = objs[0].groupId;
        const si = objs[0].sceneIndex;
        const members = (canvas.getObjects() as TaggedObject[]).filter(
          (x) => x.groupId === gid && x.sceneIndex === si && x.selectable,
        );
        if (members.length > 1) {
          canvas.setActiveObject(new ActiveSelection(members, { canvas }));
          canvas.requestRenderAll();
          return; // selection:updated re-fires with the full group
        }
      }
      const sceneIdx = objs[0].sceneIndex ?? null;
      selectNodeRef.current?.(
        sceneIdx,
        objs.map((o) => o.nodeId).filter((id): id is string => !!id),
      );
    };
    canvas.on("selection:created", reportSelection);
    canvas.on("selection:updated", reportSelection);
    canvas.on("selection:cleared", () => {
      if (!suppressSelRef.current) selectNodeRef.current?.(null, []);
    });

    // Inline text editing: double-click a text node, type, blur → sync back to the model (only on
    // exit, so no mid-type re-render interrupts the edit).
    canvas.on("text:editing:exited", (opt) => {
      const obj = opt.target as (TaggedObject & { text?: string }) | undefined;
      if (obj && obj.nodeId && obj.sceneIndex !== undefined) {
        textEditRef.current?.(obj.sceneIndex, obj.nodeId, obj.text ?? "");
      }
    });

    canvas.on("object:modified", (opt) => {
      const target = opt.target as (TaggedObject & { getObjects?: () => TaggedObject[] }) | undefined;
      if (!target) return;
      // A group / multi-selection move: write back each member's absolute box.
      const members = typeof target.getObjects === "function" ? target.getObjects() : null;
      if (members && members.length > 0 && !target.nodeId) {
        for (const member of members) {
          if (!member.nodeId || member.sceneIndex === undefined) continue;
          const d = util.qrDecompose(member.calcTransformMatrix());
          const w = (member.width ?? 0) * d.scaleX;
          const h = (member.height ?? 0) * d.scaleY;
          const originX = sceneOriginX(designRef.current, member.sceneIndex);
          changeRef.current?.(member.sceneIndex, member.nodeId, {
            x: Math.round(d.translateX - w / 2 - originX),
            y: Math.round(d.translateY - h / 2),
            width: Math.round(w),
            height: Math.round(h),
          });
        }
        return;
      }
      if (!target.nodeId || target.sceneIndex === undefined) return;
      const originX = sceneOriginX(designRef.current, target.sceneIndex);
      changeRef.current?.(target.sceneIndex, target.nodeId, {
        x: Math.round((target.left ?? 0) - originX),
        y: Math.round(target.top ?? 0),
        width: Math.round(target.getScaledWidth()),
        height: Math.round(target.getScaledHeight()),
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
      window.removeEventListener("keydown", onDeleteKey);
      onReady?.(null);
      sceneRectRef.current?.(null);
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
            t.groupId = scene.nodes.find((n) => n.id === t.nodeId)?.groupId;
            // Capture the base transform for the animation engine (animated = base × state).
            t.baseLeft = t.left;
            t.baseTop = t.top ?? 0;
            t.baseScaleX = t.scaleX ?? 1;
            t.baseScaleY = t.scaleY ?? 1;
            t.baseAngle = t.angle ?? 0;
            t.baseOpacity = t.opacity ?? 1;
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
      // Suppress selection events for the whole teardown+rebuild so the Inspector doesn't blink.
      suppressSelRef.current = true;
      canvas.remove(...canvas.getObjects());

      design.scenes.forEach((scene, i) => {
        const originX = sceneOriginX(design, i);
        const active = i === activeScene && highlightActive;
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
      if (containerRef.current) {
        containerRef.current.dataset.entities = String(design.scenes[activeScene]?.nodes.length ?? 0);
      }
      // Restore the selection on the rebuilt objects so the Inspector persists across edits.
      const keepId = selectedNodeIdRef.current;
      if (keepId) {
        const obj = canvas
          .getObjects()
          .find((o) => (o as TaggedObject).nodeId === keepId && (o as TaggedObject).sceneIndex === activeScene);
        if (obj && obj.selectable) canvas.setActiveObject(obj);
      }
      suppressSelRef.current = false;
      canvas.requestRenderAll();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, activeScene, highlightActive]);

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
