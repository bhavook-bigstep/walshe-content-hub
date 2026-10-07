import { describe, expect, it } from "vitest";
import {
  FORMAT_NAMES,
  FORMAT_PRESETS,
  getFormatPreset,
  isFormatName,
} from "../lib/studio/formats";

// AC8 — Design Studio: pick a format (social image / story / multi-page pamphlet).
// The manifest proof node-id is `apps/web/tests/formats.test.ts::test_format_presets`, so the
// test TITLE must be exactly `test_format_presets` (the acceptance matrix keys on it).
describe("studio formats", () => {
  it("test_format_presets", () => {
    // Every format, in display order — square + portrait + landscape (AC88 widened AC8's three).
    expect(FORMAT_NAMES).toEqual([
      "social", "post", "story", "wide", "banner", "flyer", "pamphlet", "card",
    ]);

    // Each preset yields the correct dimensions + page count.
    expect(getFormatPreset("social")).toMatchObject({ width: 1080, height: 1080, pages: 1, multiPage: false });
    expect(getFormatPreset("story")).toMatchObject({ width: 1080, height: 1920, pages: 1, multiPage: false });
    // New orientations.
    expect(getFormatPreset("post")).toMatchObject({ width: 1080, height: 1350, orientation: "portrait" });
    expect(getFormatPreset("wide")).toMatchObject({ width: 1920, height: 1080, orientation: "landscape" });
    expect(getFormatPreset("banner")).toMatchObject({ width: 1200, height: 628, orientation: "landscape" });
    expect(getFormatPreset("card")).toMatchObject({ width: 1050, height: 600, orientation: "landscape" });

    // Only the pamphlet is multi-page; every other format is single-page.
    const pamphlet = getFormatPreset("pamphlet");
    expect(pamphlet.pages).toBeGreaterThan(1);
    expect(pamphlet.multiPage).toBe(true);
    for (const name of FORMAT_NAMES) {
      if (name !== "pamphlet") expect(FORMAT_PRESETS[name].multiPage).toBe(false);
    }

    // Every preset's `name` matches its record key (no drift when a preset travels alone).
    for (const name of FORMAT_NAMES) {
      expect(FORMAT_PRESETS[name].name).toBe(name);
    }

    // Guards: a known name narrows; an unknown one is rejected both ways.
    expect(isFormatName("social")).toBe(true);
    expect(isFormatName("wide")).toBe(true);
    expect(isFormatName("zzz")).toBe(false);
    expect(() => getFormatPreset("zzz")).toThrow(/Unknown studio format/);
  });
});
