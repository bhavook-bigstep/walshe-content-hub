import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

// AC19 — the Walshe design system is defined once in the central theme and exposes the brand
// tokens extracted from walshegroup.com (docs/design/ui-brief.md §3). This test is the proof.
describe("walshe design tokens", () => {
  it("test_theme_exposes_walshe_tokens", () => {
    const colors = config.theme?.extend?.colors as Record<string, Record<string, string>> | undefined;
    expect(colors).toBeDefined();
    const walshe = colors!.walshe;
    expect(walshe).toBeDefined();

    // §3 palette — exact hex values read from the live site.
    expect(walshe).toMatchObject({
      teal: "#005653",
      mint: "#E5F6DF",
      stone: "#ECEBE8",
      ink: "#000000",
      grey: "#737373",
      white: "#FFFFFF",
      green: "#00AE41",
    });

    // Typography scale, spacing base and radius are part of the system.
    const fontFamily = config.theme?.extend?.fontFamily as Record<string, string[]> | undefined;
    expect(fontFamily?.sans).toContain("Founders Grotesk");

    const radius = config.theme?.extend?.borderRadius as Record<string, string> | undefined;
    expect(radius).toMatchObject({ sm: "6px", md: "12px", pill: "999px" });
  });
});
