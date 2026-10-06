// Shared mapping from the serialisable design model (ops.ts) to Fabric objects. Used by both the
// interactive StudioCanvas and the offscreen PNG renderer, so what you see equals what you export.
import { Ellipse, FabricImage, Line, Rect, Textbox, type FabricObject } from "fabric";
import type { DesignNode } from "./ops";

const DEFAULT_FONT = "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

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
  } else if (n.type === "image" && n.src) {
    try {
      const img = await FabricImage.fromURL(n.src, { crossOrigin: "anonymous" });
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
