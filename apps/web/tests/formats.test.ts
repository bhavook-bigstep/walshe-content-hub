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
    // Exactly the three documented formats, in display order.
    expect(FORMAT_NAMES).toEqual(["social", "story", "pamphlet"]);

    // Each preset yields the correct dimensions + page count.
    expect(getFormatPreset("social")).toMatchObject({ width: 1080, height: 1080, pages: 1, multiPage: false });
    expect(getFormatPreset("story")).toMatchObject({ width: 1080, height: 1920, pages: 1, multiPage: false });

    // Only the pamphlet is multi-page.
    const pamphlet = getFormatPreset("pamphlet");
    expect(pamphlet.pages).toBeGreaterThan(1);
    expect(pamphlet.multiPage).toBe(true);
    expect(pamphlet.width).toBe(1240);
    expect(pamphlet.height).toBe(1754);

    // Every preset's `name` matches its record key (no drift when a preset travels alone).
    for (const name of FORMAT_NAMES) {
      expect(FORMAT_PRESETS[name].name).toBe(name);
    }

    // Guards: a known name narrows; an unknown one is rejected both ways.
    expect(isFormatName("social")).toBe(true);
    expect(isFormatName("flyer")).toBe(false);
    expect(() => getFormatPreset("flyer")).toThrow(/Unknown studio format/);
  });
});
