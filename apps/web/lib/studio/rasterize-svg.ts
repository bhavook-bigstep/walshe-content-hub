// Rasterise a design's inline-SVG image sources to PNG `data:` URLs, so a SERVER-side export (the
// PDF / email-HTML renderers) can embed them as bitmaps. The server can't render SVG, so a sprite's
// frame, a decorative sticker or any `data:image/svg+xml` source would otherwise fall back to a
// neutral box. Browser-only (uses an offscreen <canvas>); kept separate from the pure export-prep so
// that stays DOM-free. Same-origin `data:` sources don't taint the canvas, so toDataURL succeeds.
import type { DesignDoc } from "./ops";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load error"));
    img.src = src;
  });
}

/** Draw an SVG `data:` URL into a PNG `data:` URL at ~2× the node box (crisp), or null on failure. */
async function svgToPng(src: string, width: number, height: number): Promise<string | null> {
  try {
    const img = await loadImage(src);
    const scale = 2;
    const w = Math.max(1, Math.round((width || img.width || 1) * scale));
    const h = Math.max(1, Math.round((height || img.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Return a copy of `design` with every inline-SVG image source replaced by a PNG `data:` URL.
 * Non-SVG sources (photos, already-PNG) pass through unchanged; a failed raster keeps the original. */
export async function rasterizeSvgSources(design: DesignDoc): Promise<DesignDoc> {
  const scenes = await Promise.all(
    design.scenes.map(async (scene) => ({
      ...scene,
      nodes: await Promise.all(
        scene.nodes.map(async (node) => {
          if (node.type === "image" && typeof node.src === "string" && node.src.startsWith("data:image/svg+xml")) {
            const png = await svgToPng(node.src, node.width, node.height);
            return png ? { ...node, src: png } : node;
          }
          return node;
        }),
      ),
    })),
  );
  return { ...design, scenes };
}
