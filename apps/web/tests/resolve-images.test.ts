import { describe, expect, it, vi } from "vitest";
import { resolveDesignImageSrcs } from "../lib/studio/resolve-images";
import { newDesign, addCatalogImage, addText, type DesignDoc } from "../lib/studio/ops";

const imageNodes = (d: DesignDoc) => d.scenes.flatMap((s) => s.nodes.filter((n) => n.type === "image"));

describe("resolveDesignImageSrcs", () => {
  it("re-resolves src from the stable object key (stored blob: URL is replaced)", async () => {
    let d = newDesign("social");
    d = addCatalogImage(
      d,
      0,
      { src: "blob:dead", catalogItemId: "asset-1", objectKey: "assets/u1/a.png" },
      { x: 0, y: 0, width: 10, height: 10 },
    );
    const resolve = vi.fn(async (key: string) => `blob:fresh-for-${key}`);

    const out = await resolveDesignImageSrcs(d, resolve);

    expect(imageNodes(out)[0].src).toBe("blob:fresh-for-assets/u1/a.png");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("leaves nodes without an object key untouched and never fetches for them", async () => {
    let d = newDesign("social");
    d = addText(d, 0, "Title");
    // An entry-card image with a persistent data: URL and no object key.
    d = addCatalogImage(d, 0, { src: "data:image/png;base64,QQ==", catalogItemId: "entry-3" }, { x: 0, y: 0, width: 10, height: 10 });
    const resolve = vi.fn();

    const out = await resolveDesignImageSrcs(d, resolve);

    expect(imageNodes(out)[0].src).toBe("data:image/png;base64,QQ==");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("keeps the existing src when a resolve fails", async () => {
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "blob:old", catalogItemId: "asset-9", objectKey: "k" }, { x: 0, y: 0, width: 10, height: 10 });
    const resolve = vi.fn(async () => {
      throw new Error("gone");
    });

    const out = await resolveDesignImageSrcs(d, resolve);
    expect(imageNodes(out)[0].src).toBe("blob:old");
  });

  it("re-resolves a video node's videoSrc from its videoKey (the clip the canvas plays)", async () => {
    let d = newDesign("social");
    d = addCatalogImage(
      d,
      0,
      { src: "blob:deadclip", catalogItemId: "asset-7", videoKey: "assets/u1/clip.mp4", kind: "video" },
      { x: 0, y: 0, width: 10, height: 10 },
    );
    const resolve = vi.fn(async (key: string) => `blob:fresh-${key}`);

    const out = await resolveDesignImageSrcs(d, resolve);

    const node = imageNodes(out)[0];
    expect(node.videoSrc).toBe("blob:fresh-assets/u1/clip.mp4"); // live clip re-resolved
    expect(node.videoKey).toBe("assets/u1/clip.mp4"); // stable key preserved
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("fetches each distinct key only once across scenes", async () => {
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "blob:a", catalogItemId: "asset-1", objectKey: "same" }, { x: 0, y: 0, width: 10, height: 10 });
    d = addCatalogImage(d, 0, { src: "blob:b", catalogItemId: "asset-1", objectKey: "same" }, { x: 0, y: 0, width: 10, height: 10 });
    const resolve = vi.fn(async (k: string) => `r:${k}`);

    const out = await resolveDesignImageSrcs(d, resolve);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(imageNodes(out).every((n) => n.src === "r:same")).toBe(true);
  });
});
