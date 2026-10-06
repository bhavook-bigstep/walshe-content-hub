// Re-resolve a loaded design's image sources. Placed media stores an ephemeral `blob:` URL that is
// dead after a reload, plus the stable storage `objectKey`; on open we refetch a fresh URL from the
// key so the images reappear. Kept Fabric/DOM-free so it stays unit-testable in plain node.
import type { DesignDoc } from "./ops";

/**
 * Return a copy of `design` with every image node that has an `objectKey` re-resolved to a fresh
 * `src` via `resolve(objectKey)`. Nodes without an object key (e.g. composed entry-card `data:`
 * URLs that persist on their own) are left untouched; a failed resolve keeps the existing src.
 */
export async function resolveDesignImageSrcs(
  design: DesignDoc,
  resolve: (objectKey: string) => Promise<string>,
): Promise<DesignDoc> {
  // Resolve each distinct key once, so a key reused across scenes is only fetched a single time.
  const keys = new Set<string>();
  for (const scene of design.scenes) {
    for (const n of scene.nodes) {
      if (n.type === "image" && n.objectKey) keys.add(n.objectKey);
    }
  }
  if (keys.size === 0) return design;

  const resolved = new Map<string, string>();
  await Promise.all(
    [...keys].map(async (key) => {
      try {
        resolved.set(key, await resolve(key));
      } catch {
        /* leave unresolved; the node keeps its existing src */
      }
    }),
  );

  return {
    ...design,
    scenes: design.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.map((n) =>
        n.type === "image" && n.objectKey && resolved.has(n.objectKey)
          ? { ...n, src: resolved.get(n.objectKey)! }
          : n,
      ),
    })),
  };
}
