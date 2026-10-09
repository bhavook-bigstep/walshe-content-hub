import { describe, expect, test } from "vitest";
import { buildSocialPostForm } from "../lib/social/form";

describe("buildSocialPostForm", () => {
  const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

  test("packs composition_id, channel, image and optional scheduled_at", () => {
    const form = buildSocialPostForm({
      compositionId: 7,
      channel: "instagram",
      scheduledAtISO: "2026-10-08T09:10:00.000Z",
      jpeg: jpeg(),
    });
    expect(form.get("composition_id")).toBe("7");
    expect(form.get("channel")).toBe("instagram");
    expect(form.get("scheduled_at")).toBe("2026-10-08T09:10:00.000Z");
    const img = form.get("image");
    expect(img).toBeInstanceOf(File);
    expect((img as File).type).toBe("image/jpeg");
  });

  test("omits scheduled_at when null", () => {
    const form = buildSocialPostForm({
      compositionId: 1,
      channel: "instagram",
      scheduledAtISO: null,
      jpeg: jpeg(),
    });
    expect(form.has("scheduled_at")).toBe(false);
  });
});
