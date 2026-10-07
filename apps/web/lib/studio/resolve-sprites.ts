// Re-resolve imported-sprite frames after a reload. An inserted imported sprite stores both its
// ephemeral `frames` (blob: URLs, dead after reload) AND a stable `sprite: "user:<id>"` reference;
// on open we refetch the frame URLs from the id so the animation reappears. Kept DOM/Fabric-free so
// it stays unit-testable in plain node.
import type { DesignDoc } from "./ops";

/** The numeric id of an imported sprite reference (`sprite: "user:<id>"`), or null for anything else. */
export function userSpriteId(sprite: string | undefined): number | null {
  if (typeof sprite !== "string" || !sprite.startsWith("user:")) return null;
  const id = Number(sprite.slice(5));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Return a copy of `design` with every imported-sprite node's `frames` re-resolved from its stable
 * `user:<id>` reference via `loadFrames(id)`. Each distinct id is loaded once; a failed load leaves
 * the node's (possibly dead) frames untouched.
 */
export async function resolveUserSprites(
  design: DesignDoc,
  loadFrames: (spriteId: number) => Promise<string[]>,
): Promise<DesignDoc> {
  const ids = new Set<number>();
  for (const scene of design.scenes) {
    for (const n of scene.nodes) {
      const id = userSpriteId(n.sprite);
      if (id) ids.add(id);
    }
  }
  if (ids.size === 0) return design;

  const framesById = new Map<number, string[]>();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const frames = await loadFrames(id);
        if (frames.length) framesById.set(id, frames);
      } catch {
        /* leave the node's existing frames */
      }
    }),
  );
  if (framesById.size === 0) return design;

  return {
    ...design,
    scenes: design.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.map((n) => {
        const id = userSpriteId(n.sprite);
        const frames = id ? framesById.get(id) : undefined;
        return frames ? { ...n, frames, src: frames[0] } : n;
      }),
    })),
  };
}
