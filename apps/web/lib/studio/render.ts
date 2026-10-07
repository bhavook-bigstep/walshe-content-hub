// Offscreen, full-resolution render of one scene — decoupled from the on-screen pan/zoom so the
// export is always the design at its true size, never the current viewport.
import { StaticCanvas, type FabricObject } from "fabric";
import { nodeToObject } from "./fabric-nodes";
import type { DesignDoc } from "./ops";

async function renderSceneCanvas(design: DesignDoc, sceneIndex: number): Promise<StaticCanvas> {
  const scene = design.scenes[sceneIndex];
  const canvas = new StaticCanvas(undefined, { width: design.width, height: design.height });
  canvas.backgroundColor = scene?.background ?? "#ffffff";
  const objects = (await Promise.all((scene?.nodes ?? []).map(nodeToObject))).filter(
    (o): o is FabricObject => o !== null,
  );
  objects.forEach((o) => canvas.add(o));
  canvas.renderAll();
  return canvas;
}

export async function renderDesignToPng(design: DesignDoc, sceneIndex: number): Promise<string> {
  const canvas = await renderSceneCanvas(design, sceneIndex);
  try {
    return canvas.toDataURL({ format: "png", multiplier: 1 });
  } finally {
    void canvas.dispose();
  }
}

/** Convert a data URL (e.g. from toDataURL) to a Blob without using fetch (works outside a browser). */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(meta)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * JPEG of one scene for Instagram (PNG is rejected by Instagram — spec gap #1). Rendered at the
 * design's native size; Instagram validates JPEG + aspect 4:5–1.91:1 server-side.
 */
export async function renderDesignToJpegBlob(
  design: DesignDoc,
  sceneIndex: number,
  quality = 0.92,
): Promise<Blob> {
  const canvas = await renderSceneCanvas(design, sceneIndex);
  try {
    return dataUrlToBlob(canvas.toDataURL({ format: "jpeg", quality, multiplier: 1 }));
  } finally {
    void canvas.dispose();
  }
}
