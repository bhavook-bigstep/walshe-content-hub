import { afterEach, describe, expect, it, vi } from "vitest";
import { inlineDesignImages } from "../lib/studio/inline-images";
import { newDesign, addText, addCatalogImage, type DesignDoc } from "../lib/studio/ops";

// A minimal FileReader stub (node has no DOM FileReader): readAsDataURL fires onload with a fixed
// data: URL, so the transform is exercised without a real browser.
class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(_blob: Blob) {
    this.result = "data:image/png;base64,QUJD"; // "ABC"
    this.onload?.();
  }
}

function withImage(): DesignDoc {
  let d = newDesign("social");
  d = addText(d, 0, "Title", { fontSize: 40 });
  d = addCatalogImage(d, 0, { src: "blob:photo", catalogItemId: "entry-1" }, { x: 0, y: 0, width: 100, height: 100 });
  return d;
}

const imgNode = (d: DesignDoc) => d.scenes[0].nodes.find((n) => n.type === "image")!;
const textNode = (d: DesignDoc) => d.scenes[0].nodes.find((n) => n.type === "text")!;

describe("inlineDesignImages", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("inlines a blob: image src to a data: URL and leaves non-image nodes untouched", async () => {
    vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);
    vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => new Blob(["x"]) }) as Response));

    const src = withImage();
    const out = await inlineDesignImages(src);

    expect(imgNode(out).src).toBe("data:image/png;base64,QUJD");
    expect(textNode(out).text).toBe(textNode(src).text); // text node unchanged
    expect(imgNode(src).src).toBe("blob:photo"); // original design not mutated
  });

  it("passes a data: URL through without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    let d = newDesign("social");
    d = addCatalogImage(d, 0, { src: "data:image/png;base64,QQ==", catalogItemId: "a" }, { x: 0, y: 0, width: 10, height: 10 });

    const out = await inlineDesignImages(d);

    expect(imgNode(out).src).toBe("data:image/png;base64,QQ==");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the original src when inlining fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network");
    }));

    const out = await inlineDesignImages(withImage());
    expect(imgNode(out).src).toBe("blob:photo");
  });
});
