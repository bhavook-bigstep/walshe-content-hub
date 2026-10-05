/**
 * AC47 — serialise the storyboard (ordered scenes) into a POST /render/video request.
 *
 * Pure + deterministic (no clock/randomness): the same design + catalog items always produce the
 * same request. Each design scene becomes a video scene carrying its lifespan (durationMs) and
 * transition; the image comes from the scene's first catalog-image node (provenance → item_id,
 * resolved + access-checked server-side, Contract 1), the caption from the scene's first non-empty
 * text node (falling back to the catalog item's title), and the title from the item (or scene name).
 */
import type { VideoRequest } from "../api";
import type { DesignDoc } from "./ops";

export const MAX_SCENES = 20;
export const MAX_TEXT = 200;

export interface VideoCatalogItem {
  id: number;
  title: string;
  description?: string;
}

type RequestScene = VideoRequest["scenes"][number];

export function designToVideoScenes(
  design: DesignDoc,
  items: readonly VideoCatalogItem[],
): RequestScene[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return design.scenes.slice(0, MAX_SCENES).map((scene) => {
    const imageNode = scene.nodes.find((n) => n.type === "image" && n.catalogItemId);
    const parsedId = imageNode ? Number(imageNode.catalogItemId) : NaN;
    const itemId = Number.isFinite(parsedId) ? parsedId : null;
    const item = itemId !== null ? byId.get(itemId) : undefined;
    const textNode = scene.nodes.find((n) => n.type === "text" && n.text?.trim());

    const title = (item?.title ?? scene.name).trim().slice(0, MAX_TEXT);
    const caption = (textNode?.text ?? item?.title ?? "").trim().slice(0, MAX_TEXT);
    return {
      item_id: itemId,
      title: title || scene.name,
      caption,
      duration_ms: scene.durationMs,
      transition: scene.transition,
    };
  });
}

export function designToVideoRequest(
  design: DesignDoc,
  items: readonly VideoCatalogItem[],
  narrate: boolean,
): VideoRequest {
  return { scenes: designToVideoScenes(design, items), narrate };
}
