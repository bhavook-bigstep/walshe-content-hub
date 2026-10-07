import { describe, expect, test } from "vitest";
import { buildPublishForm } from "../lib/studio/instagram";

describe("buildPublishForm", () => {
  test("packs composition id, caption, and the jpeg as a file field", () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const fd = buildPublishForm({ compositionId: 7, caption: "Visit Galway", jpeg: blob });
    expect(fd.get("composition_id")).toBe("7");
    expect(fd.get("caption")).toBe("Visit Galway");
    const image = fd.get("image") as File;
    expect(image).toBeInstanceOf(File);
    expect(image.type).toBe("image/jpeg");
    expect(image.name).toBe("post.jpg");
  });
});
