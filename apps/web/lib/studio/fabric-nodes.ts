// Shared mapping from the serialisable design model (ops.ts) to Fabric objects. Used by both the
// interactive StudioCanvas and the offscreen PNG renderer, so what you see equals what you export.
import { Ellipse, FabricImage, Line, Rect, Textbox, type FabricObject } from "fabric";
import type { DesignNode } from "./ops";

/** Build a Fabric object for a design node, tagging it with the node id for write-back. */
export async function nodeToObject(n: DesignNode): Promise<FabricObject | null> {
  const base = { left: n.x, top: n.y };
  const color = n.color ?? "#111111";
  let obj: FabricObject | null = null;

  if (n.type === "text") {
    obj = new Textbox(n.text ?? "", { ...base, width: n.width, fill: color, fontSize: 48 });
  } else if (n.type === "shape") {
    if (n.shape === "ellipse") obj = new Ellipse({ ...base, rx: n.width / 2, ry: n.height / 2, fill: color });
    else if (n.shape === "line") obj = new Line([n.x, n.y, n.x + n.width, n.y + n.height], { stroke: color, strokeWidth: 4 });
    else obj = new Rect({ ...base, width: n.width, height: n.height, fill: color });
  } else if (n.type === "image" && n.src) {
    try {
      const img = await FabricImage.fromURL(n.src, { crossOrigin: "anonymous" });
      img.set({ ...base, scaleX: n.width / (img.width || n.width), scaleY: n.height / (img.height || n.height) });
      obj = img;
    } catch {
      obj = null;
    }
  }

  if (obj) (obj as FabricObject & { nodeId?: string }).nodeId = n.id;
  return obj;
}
