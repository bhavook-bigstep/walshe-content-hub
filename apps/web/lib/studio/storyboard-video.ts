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

/**
 * The catalog **entry** id a scene's photo comes from, parsed from an image node's `catalogItemId`.
 * Placed media is tagged `entry-<id>` (an entry card, whose cover becomes the scene photo),
 * `item-<id>` or `asset-<id>`; only `entry-<id>` (or a legacy bare number) resolves to the catalog
 * entry the server renders from (item/asset media aren't catalog entries). Returns null otherwise.
 */
function sceneEntryId(catalogItemId?: string): number | null {
  if (!catalogItemId) return null;
  const match = /^entry-(\d+)$/.exec(catalogItemId.trim());
  if (match) return Number(match[1]);
  const bare = Number(catalogItemId);
  return catalogItemId.trim() !== "" && Number.isInteger(bare) ? bare : null;
}

export function designToVideoScenes(
  design: DesignDoc,
  items: readonly VideoCatalogItem[],
): RequestScene[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  return design.scenes.slice(0, MAX_SCENES).map((scene) => {
    // The first image node that resolves to a catalog entry — its cover becomes the scene photo.
    const imageNode = scene.nodes.find((n) => n.type === "image" && sceneEntryId(n.catalogItemId) !== null);
    const itemId = imageNode ? sceneEntryId(imageNode.catalogItemId) : null;
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
