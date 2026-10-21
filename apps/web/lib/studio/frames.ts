// WYSIWYG video frame capture: rasterise each animated scene frame-by-frame off-screen, using the
// SAME Fabric renderer as the canvas and the SAME animation engine as the preview — so the exported
// video is exactly what you scrub in the editor. The server just sequences + stitches the frames.
import { StaticCanvas, type FabricObject } from "fabric";
import { getVideoDuration, isVideoObject, nodeToObject, seekVideoObject, setSpriteFrame } from "./fabric-nodes";
import { chainSegments, frameIndexAt, nodeStateAt, videoTimeAt } from "./anim";
import type { DesignDoc, Scene } from "./ops";

export const EXPORT_FPS = 20;
// Cap the long edge so a frame sequence stays a sane upload size; the video keeps the design aspect.
const MAX_DIM = 1280;

export interface SceneFrames {
  frames: string[]; // JPEG data: URLs, one per frame
  width: number;
  height: number;
}

type Pair = { node: Scene["nodes"][number]; o: FabricObject; bsx: number; bsy: number };

/** Build each node's Fabric object once onto `canvas`. Image nodes that could not load are reported
 * (a FACT about the design, not an error) so callers can surface broken images. */
async function buildPairs(canvas: StaticCanvas, scene: Scene): Promise<{ pairs: Pair[]; broken: string[] }> {
  const pairs: Pair[] = [];
  const broken: string[] = [];
  for (const node of scene.nodes) {
    const o = await nodeToObject(node);
    if (!o) {
      if (node.type === "image" && (node.src || node.frames?.length)) broken.push(node.id);
      continue;
    }
    pairs.push({ node, o, bsx: o.scaleX ?? 1, bsy: o.scaleY ?? 1 });
    canvas.add(o);
  }
  return { pairs, broken };
}

/** Pose every object at scene time `t` (shared by the frame sequence and the single-still path). */
async function poseAt(pairs: Pair[], segs: ReturnType<typeof chainSegments>, t: number): Promise<void> {
  for (const p of pairs) {
    const seg = segs.get(p.node.id);
    const localT = seg ? Math.max(0, t - seg.start) : t;
    const chainHidden = seg ? !(t >= seg.start && (t < seg.start + seg.dur || seg.hold)) : false;
    const st = nodeStateAt(p.node, localT);
    p.o.set({
      left: st.x,
      top: st.y,
      scaleX: p.bsx * st.scale,
      scaleY: p.bsy * st.scale,
      angle: st.rotation,
      opacity: chainHidden ? 0 : st.opacity,
    });
    const fi = frameIndexAt(p.node, localT, !!seg); // chained members loop to fill their slot
    if (fi !== null) setSpriteFrame(p.o, fi); // advance a frame sprite's filmstrip
    p.o.setCoords();
  }
  // Composite any placed video clips: seek each to its slaved clip time (in-point + elapsed scene
  // time, held at the last frame past the clip's end — never looping) and wait for the decoded
  // frame, so output carries the real moving video in sync with the scene, not a poster.
  const videoPairs = pairs.filter((p) => isVideoObject(p.o));
  if (videoPairs.length) {
    await Promise.all(
      videoPairs.map((p) => seekVideoObject(p.o, videoTimeAt(p.node, t, getVideoDuration(p.o)))),
    );
  }
}

function outputScale(w: number, h: number): number {
  return Math.min(1, MAX_DIM / Math.max(w, h));
}

/** Render one scene to a JPEG frame sequence at `fps`, animated via the shared engine. */
export async function renderSceneFrames(
  scene: Scene,
  designWidth: number,
  designHeight: number,
  fps: number = EXPORT_FPS,
): Promise<SceneFrames> {
  const scale = outputScale(designWidth, designHeight);
  const canvas = new StaticCanvas(undefined, { width: designWidth, height: designHeight });
  try {
    canvas.backgroundColor = scene.background || "#ffffff";
    // Build each node's object once; reuse across frames (no per-frame image re-decode).
    const { pairs } = await buildPairs(canvas, scene);
    const frameCount = Math.max(1, Math.round((scene.durationMs / 1000) * fps));
    const segs = chainSegments(scene.nodes); // sprite chains: play each member in its own window
    const frames: string[] = [];
    for (let f = 0; f < frameCount; f++) {
      await poseAt(pairs, segs, (f / fps) * 1000);
      canvas.renderAll();
      // multiplier scales the output down to the capped size, keeping the design's aspect.
      frames.push(canvas.toDataURL({ format: "jpeg", quality: 0.72, multiplier: scale }));
    }
    return { frames, width: Math.round(designWidth * scale), height: Math.round(designHeight * scale) };
  } finally {
    void canvas.dispose();
  }
}

export interface SceneStill {
  png: string; // PNG data: URL
  width: number;
  height: number;
  /** ids of image nodes whose src failed to load (a reported fact, not an error) */
  brokenImageIds: string[];
}

/** Length of the scene-to-scene transition window (ms) sampled either side of the boundary. */
export const TRANSITION_SAMPLE_MS = 500;

/** Deterministic sample times (ms) for reviewing a scene: start, mid, end, plus each transition
 * boundary (the first instant of the outgoing transition) when the scene transitions into the next. */
export function sampleTimesForScene(scene: Pick<Scene, "durationMs" | "transition">): number[] {
  const d = Math.max(1, Math.round(scene.durationMs));
  const end = Math.max(0, d - 1);
  const times = [0, Math.round(d / 2), end];
  if (scene.transition && scene.transition !== "none") {
    times.push(Math.max(0, d - Math.min(TRANSITION_SAMPLE_MS, Math.floor(d / 2))));
  }
  return [...new Set(times)].sort((a, b) => a - b);
}

/** Render ONE still of a scene at time `atMs` as PNG (pure given a DOM + canvas; no free-running clock). */
export async function renderSceneStill(
  scene: Scene,
  designWidth: number,
  designHeight: number,
  atMs: number,
): Promise<SceneStill> {
  const scale = outputScale(designWidth, designHeight);
  const canvas = new StaticCanvas(undefined, { width: designWidth, height: designHeight });
  try {
    canvas.backgroundColor = scene.background || "#ffffff";
    const { pairs, broken } = await buildPairs(canvas, scene);
    await poseAt(pairs, chainSegments(scene.nodes), Math.max(0, atMs));
    canvas.renderAll();
    return {
      png: canvas.toDataURL({ format: "png", multiplier: scale }),
      width: Math.round(designWidth * scale),
      height: Math.round(designHeight * scale),
      brokenImageIds: broken,
    };
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
