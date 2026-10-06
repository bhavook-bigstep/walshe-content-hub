// WYSIWYG video frame capture: rasterise each animated scene frame-by-frame off-screen, using the
// SAME Fabric renderer as the canvas and the SAME animation engine as the preview — so the exported
// video is exactly what you scrub in the editor. The server just sequences + stitches the frames.
import { StaticCanvas, type FabricObject } from "fabric";
import { nodeToObject } from "./fabric-nodes";
import { nodeStateAt } from "./anim";
import type { DesignDoc, Scene } from "./ops";

export const EXPORT_FPS = 20;
// Cap the long edge so a frame sequence stays a sane upload size; the video keeps the design aspect.
const MAX_DIM = 1280;

export interface SceneFrames {
  frames: string[]; // JPEG data: URLs, one per frame
  width: number;
  height: number;
}

/** Render one scene to a JPEG frame sequence at `fps`, animated via the shared engine. */
export async function renderSceneFrames(
  scene: Scene,
  designWidth: number,
  designHeight: number,
  fps: number = EXPORT_FPS,
): Promise<SceneFrames> {
  const scale = Math.min(1, MAX_DIM / Math.max(designWidth, designHeight));
  const canvas = new StaticCanvas(undefined, { width: designWidth, height: designHeight });
  try {
    canvas.backgroundColor = scene.background || "#ffffff";
    // Build each node's object once; reuse across frames (no per-frame image re-decode).
    const pairs: { node: Scene["nodes"][number]; o: FabricObject; bsx: number; bsy: number }[] = [];
    for (const node of scene.nodes) {
      const o = await nodeToObject(node);
      if (!o) continue;
      pairs.push({ node, o, bsx: o.scaleX ?? 1, bsy: o.scaleY ?? 1 });
      canvas.add(o);
    }
    const frameCount = Math.max(1, Math.round((scene.durationMs / 1000) * fps));
    const frames: string[] = [];
    for (let f = 0; f < frameCount; f++) {
      const t = (f / fps) * 1000;
      for (const p of pairs) {
        const st = nodeStateAt(p.node, t);
        p.o.set({
          left: st.x,
          top: st.y,
          scaleX: p.bsx * st.scale,
          scaleY: p.bsy * st.scale,
          angle: st.rotation,
          opacity: st.opacity,
        });
        p.o.setCoords();
      }
      canvas.renderAll();
      // multiplier scales the output down to the capped size, keeping the design's aspect.
      frames.push(canvas.toDataURL({ format: "jpeg", quality: 0.72, multiplier: scale }));
    }
    return { frames, width: Math.round(designWidth * scale), height: Math.round(designHeight * scale) };
  } finally {
    void canvas.dispose();
  }
}

/** Render every scene of a design to frame sequences (the body of the frame-capture video export). */
export async function renderDesignFrames(design: DesignDoc, fps: number = EXPORT_FPS): Promise<SceneFrames[]> {
  const out: SceneFrames[] = [];
  for (const scene of design.scenes) {
    out.push(await renderSceneFrames(scene, design.width, design.height, fps));
  }
  return out;
}
