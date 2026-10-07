// Shared mapping from the serialisable design model (ops.ts) to Fabric objects. Used by both the
// interactive StudioCanvas and the offscreen PNG renderer, so what you see equals what you export.
import { Ellipse, FabricImage, Line, Rect, Textbox, type FabricObject } from "fabric";
import { PLACEHOLDER_SRC, type DesignNode } from "./ops";

const DEFAULT_FONT = "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

/** A Fabric object that carries a preloaded frame-sprite filmstrip, for frame-by-frame playback. */
type SpriteObject = FabricObject & { spriteFrames?: HTMLImageElement[] };

/** A Fabric image whose element is a live <video>, so the canvas + export draw the real moving clip.
 * The video element is retained here so the preview transport can play/seek it and the frame-capture
 * export can seek it per frame. */
type VideoObject = FabricObject & { videoEl?: HTMLVideoElement };

/** Whether a Fabric object is backed by a live video element. */
export function isVideoObject(obj: FabricObject): obj is VideoObject {
  return !!(obj as VideoObject).videoEl;
}

/** The decoded duration (seconds) of a live-video object's clip, or undefined if not yet known. */
export function getVideoDuration(obj: FabricObject): number | undefined {
  const v = (obj as VideoObject).videoEl;
  return v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : undefined;
}

/** Load one image src into an HTMLImageElement (data: URLs resolve synchronously-fast, no network). */
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

/** Load a video src into a decoded, seekable <video> element (muted so autoplay/export is allowed). */
function loadVideoEl(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.loop = false; // the scene clock drives looping (StudioCanvas.driveVideo), not the element
    v.crossOrigin = "anonymous";
    const onReady = () => {
      v.removeEventListener("loadeddata", onReady);
      // A <video> element's intrinsic .width/.height default to 0, and Fabric uses them as the
      // source draw rectangle — leave them unset and the frame renders blank. Pin them to the real
      // decoded size so Fabric draws the whole frame.
      v.width = v.videoWidth;
      v.height = v.videoHeight;
      resolve(v);
    };
    v.addEventListener("loadeddata", onReady, { once: true });
    v.onerror = () => reject(new Error("video load error"));
    v.src = src;
    v.load();
  });
}

/** Seek a live-video object to `seconds` (clamped into the clip — it does NOT wrap/loop) and resolve
 * once the frame is actually decoded + painted, so a following canvas render captures that exact
 * frame. The slaved scene→clip mapping (anim.ts `videoTimeAt`) decides the time; this just lands it.
 * No-op for a non-video object. */
export function seekVideoObject(obj: FabricObject, seconds: number): Promise<void> {
  const v = (obj as VideoObject).videoEl;
  if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return Promise.resolve();
  const target = Math.min(Math.max(0, seconds), Math.max(0, v.duration - 0.04));
  return new Promise((resolve) => {
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      v.removeEventListener("seeked", onSeeked);
      obj.dirty = true;
      resolve();
    };
    const finish = () => {
      // requestVideoFrameCallback fires once the seeked frame is actually presented — the most
      // accurate signal. But it only fires while the page composites (not in a hidden/headless tab),
      // so race it against a short timeout so a capture never hangs.
      const rvfc = (v as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      }).requestVideoFrameCallback;
      if (rvfc) rvfc.call(v, () => settle());
      setTimeout(settle, 60);
    };
    const onSeeked = () => finish();
    v.addEventListener("seeked", onSeeked);
    // Outer safety net: if `seeked` never fires at all — e.g. the time is already at the target so
    // the browser emits no event, or a decode stalls — settle anyway so the capture loop proceeds.
    setTimeout(finish, 120);
    v.currentTime = target;
  });
}

/** Show frame `index` of a frame-sprite object. All frames share one intrinsic size, so swapping the
 * element keeps the object's scale (and therefore its on-canvas size) unchanged. No-op otherwise. */
export function setSpriteFrame(obj: FabricObject, index: number): void {
  const frames = (obj as SpriteObject).spriteFrames;
  if (!frames || frames.length < 2) return;
  const el = frames[((index % frames.length) + frames.length) % frames.length];
  if (!el || (obj as FabricImage).getElement?.() === el) return;
  (obj as FabricImage).setElement(el);
  obj.dirty = true;
}

/** Style props shared by every object kind (opacity + rotation). */
function common(n: DesignNode): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  if (n.opacity !== undefined) c.opacity = Math.max(0, Math.min(1, n.opacity));
  if (n.angle !== undefined) c.angle = n.angle;
  return c;
}

/** Build a Fabric object for a design node, tagging it with the node id for write-back. */
export async function nodeToObject(n: DesignNode): Promise<FabricObject | null> {
  const base = { left: n.x, top: n.y };
  const color = n.color ?? "#111111";
  let obj: FabricObject | null = null;

  if (n.type === "text") {
    obj = new Textbox(n.text ?? "", {
      ...base,
      width: n.width,
      fill: color,
      fontSize: n.fontSize ?? 48,
      fontFamily: n.fontFamily ?? DEFAULT_FONT,
      fontWeight: n.fontWeight ?? "normal",
      fontStyle: n.fontStyle ?? "normal",
      textAlign: n.textAlign ?? "left",
      lineHeight: n.lineHeight ?? 1.16,
      ...common(n),
    });
  } else if (n.type === "shape") {
    const strokeProps = n.stroke ? { stroke: n.stroke, strokeWidth: n.strokeWidth ?? 2 } : {};
    if (n.shape === "ellipse") {
      obj = new Ellipse({ ...base, rx: n.width / 2, ry: n.height / 2, fill: color, ...strokeProps, ...common(n) });
    } else if (n.shape === "line") {
      obj = new Line([n.x, n.y, n.x + n.width, n.y + n.height], {
        stroke: n.stroke ?? color,
        strokeWidth: n.strokeWidth ?? 4,
        ...common(n),
      });
    } else {
      const r = n.radius ?? 0;
      obj = new Rect({ ...base, width: n.width, height: n.height, fill: color, rx: r, ry: r, ...strokeProps, ...common(n) });
    }
  } else if (n.type === "image" && (n.src || n.frames?.length || n.placeholder)) {
    try {
      // A frame sprite preloads its whole filmstrip and starts on frame 0; a plain image loads its
      // single src; an unfilled placeholder shows the dashed "Add photo" frame. Build a FabricImage
      // and scale it to the node's box.
      let img: FabricImage;
      if (n.videoSrc) {
        // A placed video clip: draw the real moving frame (not the poster). Keep objectCaching off
        // so each render re-reads the current video frame, and retain the element for play/seek.
        try {
          const v = await loadVideoEl(n.videoSrc);
          img = new FabricImage(v, { objectCaching: false });
          (img as VideoObject).videoEl = v;
        } catch {
          // Offline / dead blob after reload (before re-resolve): fall back to the poster still.
          img = await FabricImage.fromURL(n.src || PLACEHOLDER_SRC, { crossOrigin: "anonymous" });
        }
      } else if (n.frames && n.frames.length > 0) {
        const els = await Promise.all(n.frames.map(loadImageEl));
        img = new FabricImage(els[0]);
        (img as SpriteObject).spriteFrames = els;
      } else {
        img = await FabricImage.fromURL(n.src || PLACEHOLDER_SRC, { crossOrigin: "anonymous" });
      }
      img.set({
        ...base,
        scaleX: n.width / (img.width || n.width),
        scaleY: n.height / (img.height || n.height),
        ...common(n),
      });
      if (n.radius) {
        // Rounded image frame: clip to a rounded rect in the image's own (unscaled) coord space.
        const iw = img.width || n.width;
        const ih = img.height || n.height;
        const rr = n.radius / Math.max(n.width / iw, 0.0001);
        img.clipPath = new Rect({
          width: iw,
          height: ih,
          rx: rr,
          ry: rr,
          originX: "center",
          originY: "center",
        });
      }
      obj = img;
    } catch {
      obj = null;
    }
  }

  if (obj) (obj as FabricObject & { nodeId?: string }).nodeId = n.id;
  return obj;
}
