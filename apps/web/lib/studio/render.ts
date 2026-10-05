// Offscreen, full-resolution PNG of one scene — decoupled from the on-screen pan/zoom so the export
// is always the design at its true size, never the current viewport.
import { StaticCanvas, type FabricObject } from "fabric";
import { nodeToObject } from "./fabric-nodes";
import type { DesignDoc } from "./ops";

export async function renderDesignToPng(design: DesignDoc, sceneIndex: number): Promise<string> {
  const scene = design.scenes[sceneIndex];
  const canvas = new StaticCanvas(undefined, { width: design.width, height: design.height });
  try {
    canvas.backgroundColor = scene?.background ?? "#ffffff";
    const objects = (await Promise.all((scene?.nodes ?? []).map(nodeToObject))).filter(
      (o): o is FabricObject => o !== null,
    );
    objects.forEach((o) => canvas.add(o));
    canvas.renderAll();
    return canvas.toDataURL({ format: "png", multiplier: 1 });
  } finally {
    void canvas.dispose();
  }
}
