// Re-resolve a loaded design's media sources. Placed media stores an ephemeral `blob:` URL that is
// dead after a reload, plus the stable storage key (`objectKey` for a photo, `videoKey` for a clip);
// on open we refetch a fresh URL from the key so the media reappears. Kept Fabric/DOM-free so it
// stays unit-testable in plain node.
import type { DesignDoc } from "./ops";

/**
 * Return a copy of `design` with every media node re-resolved to a fresh served URL:
 *  • an image node's `objectKey` → a new `src`,
 *  • a video node's `videoKey` → a new `videoSrc` (the clip the canvas plays + the export composites).
 * Nodes without a storage key (e.g. composed entry-card `data:` URLs that persist on their own) are
 * left untouched; a failed resolve keeps the existing value.
 */
export async function resolveDesignImageSrcs(
  design: DesignDoc,
  resolve: (objectKey: string) => Promise<string>,
): Promise<DesignDoc> {
  // Resolve each distinct key once, so a key reused across scenes is only fetched a single time.
  const keys = new Set<string>();
  for (const scene of design.scenes) {
    for (const n of scene.nodes) {
      if (n.type !== "image") continue;
      if (n.objectKey) keys.add(n.objectKey);
      if (n.videoKey) keys.add(n.videoKey);
    }
  }
  if (keys.size === 0) return design;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...keys].map(async (key) => {
      try {
        resolved.set(key, await resolve(key));
      } catch {
        /* leave unresolved; the node keeps its existing value */
      }
    }),
  );

  return {
    ...design,
    scenes: design.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.map((n) => {
        if (n.type !== "image") return n;
        let next = n;
        if (n.objectKey && resolved.has(n.objectKey)) {
          next = { ...next, src: resolved.get(n.objectKey)! };
        }
        if (n.videoKey && resolved.has(n.videoKey)) {
          next = { ...next, videoSrc: resolved.get(n.videoKey)! };
        }
        return next;
      }),
    })),
  };
}
