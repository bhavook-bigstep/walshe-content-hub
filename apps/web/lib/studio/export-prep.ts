// Normalise a design for a STATIC export (PNG / PDF / HTML), where there is no timeline:
//  • an unfilled media placeholder is removed, so its slot exports fully transparent (not the dashed
//    "Add media" frame and not a filled box);
//  • a sprite / frame-by-frame node collapses to its FIRST frame (time 0) as a plain static image,
//    since a still export can't animate — so it shows the sprite's initial state, not a blank box.
// Pure + non-mutating, so it stays unit-testable in plain node (no Fabric/DOM).
import { isPlaceholder, type DesignDoc, type DesignNode } from "./ops";

/** Return a copy of `design` ready for a still export (placeholders dropped, sprites → frame 0). */
export function prepareForExport(design: DesignDoc): DesignDoc {
  return {
    ...design,
    scenes: design.scenes.map((scene) => ({
      ...scene,
      nodes: scene.nodes.flatMap((node) => {
        // Unfilled placeholder → nothing (transparent slot).
        if (isPlaceholder(node)) return [];
        // Frame sprite → a static image of frame 0 (its initial position/state).
        if (node.type === "image" && node.frames && node.frames.length > 0) {
          const flat: DesignNode = { ...node, src: node.src ?? node.frames[0] };
          delete flat.frames;
          delete flat.fps;
          delete flat.loopFrames;
          delete flat.sprite;
          return [flat];
        }
        return [node];
      }),
    })),
  };
}
