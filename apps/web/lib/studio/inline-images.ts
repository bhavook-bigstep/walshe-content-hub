// Inline a design's image sources to `data:` URLs for a server-side export (the PDF renderer),
// which can only embed photos it receives as bytes. Kept free of Fabric/DOM-canvas imports so the
// transform stays unit-testable in a plain node environment.
import type { DesignDoc } from "./ops";

// Resolve one image source to an inline `data:` URL. A `data:` URL passes through unchanged;
// `blob:`/same-origin URLs are fetched and re-encoded. Returns null when it can't be inlined
// (e.g. a cross-origin URL that would taint), so the caller keeps the original src.
async function srcToDataUrl(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Return a copy of the design with every image node's `src` inlined to a `data:` URL, so a
 * server-side export (the PDF renderer) can embed the real photos instead of placeholder frames.
 * The live design is never mutated; nodes that fail to inline keep their original src.
 */
export async function inlineDesignImages(design: DesignDoc): Promise<DesignDoc> {
  const scenes = await Promise.all(
    design.scenes.map(async (scene) => ({
      ...scene,
      nodes: await Promise.all(
        scene.nodes.map(async (n) => {
          if (n.type !== "image" || !n.src) return n;
          const data = await srcToDataUrl(n.src);
          return data ? { ...n, src: data } : n;
        }),
      ),
    })),
  );
  return { ...design, scenes };
}
