import { describe, expect, it } from "vitest";
import {
  buildCampaignPatchForm,
  buildCampaignPostForm,
  localInputToOffsetISO,
} from "../lib/campaigns/form";

describe("buildCampaignPostForm", () => {
  it("appends fields and the JPEG file; omits scheduled_at when absent", () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const f = buildCampaignPostForm({
      compositionId: 7, caption: "Hi", scheduledAtISO: "2026-08-15T09:30:00+05:30", jpeg,
    });
    expect(f.get("composition_id")).toBe("7");
    expect(f.get("caption")).toBe("Hi");
    expect(f.get("scheduled_at")).toBe("2026-08-15T09:30:00+05:30");
    expect(f.get("image")).toBeInstanceOf(File);

    const f2 = buildCampaignPostForm({ compositionId: 7, caption: "", scheduledAtISO: null, jpeg });
    expect(f2.has("scheduled_at")).toBe(false);
  });
});

describe("localInputToOffsetISO", () => {
  it("keeps the local wall time and appends an offset (never converts to Z)", () => {
    expect(localInputToOffsetISO("2026-08-16T01:30")).toMatch(
      /^2026-08-16T01:30:00[+-]\d{2}:\d{2}$/,
    );
  });
});

describe("buildCampaignPatchForm", () => {
  it("includes only the provided fields; unschedule wins over scheduled_at", () => {
    const a = buildCampaignPatchForm({ caption: "New" });
    expect(a.get("caption")).toBe("New");
    expect(a.has("scheduled_at")).toBe(false);
    expect(a.has("unschedule")).toBe(false);

    const b = buildCampaignPatchForm({ scheduledAtISO: "2026-08-20T09:00:00+05:30" });
    expect(b.get("scheduled_at")).toBe("2026-08-20T09:00:00+05:30");

    const c = buildCampaignPatchForm({
      unschedule: true, scheduledAtISO: "2026-08-20T09:00:00+05:30",
    });
    expect(c.get("unschedule")).toBe("true");
    expect(c.has("scheduled_at")).toBe(false);
  });
});
