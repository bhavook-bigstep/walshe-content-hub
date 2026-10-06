import { describe, expect, it } from "vitest";
import {
  addCatalogImage,
  addScene,
  addText,
  newDesign,
  setSceneDuration,
  setSceneTransition,
} from "../lib/studio/ops";
import { designToVideoRequest, designToVideoScenes } from "../lib/studio/storyboard-video";

// AC47 — the storyboard serialises deterministically to a /render/video request carrying each
// scene's duration + transition, image provenance (item_id) and caption.
// Proof node-id: `apps/web/tests/storyboard-video.test.ts::test_design_to_video_request`.
const ITEMS = [{ id: 7, title: "Harbour Festival", description: "A seaside celebration" }];

describe("storyboard → video request", () => {
  it("test_design_to_video_request", () => {
    // Scene 1: a catalog image + a headline; a longer duration; a zoom transition.
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "/assets/a.png", catalogItemId: "7" });
    d = addText(d, 0, "Set sail this summer");
    d = setSceneDuration(d, d.scenes[0].id, 6000);
    d = setSceneTransition(d, d.scenes[0].id, "zoom");
    // Scene 2: no image, no text (title falls back to the scene name; no item).
    d = addScene(d);

    const scenes = designToVideoScenes(d, ITEMS);
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toEqual({
      item_id: 7,
      title: "Harbour Festival", // from the catalog item behind the image
      caption: "Set sail this summer", // from the scene's text node
      duration_ms: 6000,
      transition: "zoom",
    });
    expect(scenes[1]).toEqual({
      item_id: null,
      title: "Scene 2",
      caption: "", // no text node, no item
      duration_ms: 4000,
      transition: "fade",
    });

    // Deterministic + wraps into a VideoRequest with the narrate flag.
    expect(designToVideoScenes(d, ITEMS)).toEqual(scenes);
    expect(designToVideoRequest(d, ITEMS, true)).toEqual({ scenes, narrate: true });
  });

  it("falls back to the item title for the caption when a scene has an image but no text", () => {
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "/assets/a.png", catalogItemId: "7" });
    const [scene] = designToVideoScenes(d, ITEMS);
    expect(scene.caption).toBe("Harbour Festival");
    expect(scene.item_id).toBe(7);
  });

  it("resolves an entry-<id> image to its catalog entry id (the scene photo)", () => {
    // Placed media is tagged `entry-<id>`; the scene photo is that entry's cover (item_id = 7).
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "blob:x", catalogItemId: "entry-7" });
    const [scene] = designToVideoScenes(d, ITEMS);
    expect(scene.item_id).toBe(7);
    expect(scene.title).toBe("Harbour Festival");
  });

  it("ignores item-/asset- media (not catalog entries) → no scene photo", () => {
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "blob:x", catalogItemId: "item-5" });
    d = addScene(d);
    d = addCatalogImage(d, 1, { src: "blob:y", catalogItemId: "asset-9" });
    const scenes = designToVideoScenes(d, ITEMS);
    expect(scenes[0].item_id).toBeNull();
    expect(scenes[1].item_id).toBeNull();
  });

  it("accepts a legacy bare numeric id (server re-checks visibility)", () => {
    let unknown = newDesign("social");
    unknown = addCatalogImage(unknown, 0, { src: "/a.png", catalogItemId: "999" });
    const [b] = designToVideoScenes(unknown, ITEMS);
    expect(b.item_id).toBe(999);
    expect(b.title).toBe("Scene 1"); // no matching item -> scene name
  });
});
