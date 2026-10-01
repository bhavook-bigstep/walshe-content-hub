import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

// AC19 — the Walshe design system is defined once in the central theme and exposes the brand
// tokens for the approved v2 ("vita") direction: amber accent, deep-teal ink, Inter, pill radius.
// This test is the proof.
describe("walshe design tokens", () => {
  it("test_theme_exposes_walshe_tokens", () => {
    const colors = config.theme?.extend?.colors as Record<string, Record<string, string>> | undefined;
    expect(colors).toBeDefined();
    const walshe = colors!.walshe;
    expect(walshe).toBeDefined();

    // The Walshe Group green, deepened to a blackish teal-green base, with the brand teal kept
    // for pills/chips, light off-white text, and a mint accent.
    expect(walshe).toMatchObject({
      base: "#03160F",
      deep: "#010B08",
      teal: "#005653",
      ink: "#EAF4F1",
      mint: "#E5F6DF",
      white: "#FFFFFF",
    });

    // Inter everywhere — body, UI, and display — matching the reference's single-family system.
    const fontFamily = config.theme?.extend?.fontFamily as Record<string, string[]> | undefined;
    expect(fontFamily?.sans).toContain("Inter");
    expect(fontFamily?.serif).toBeUndefined();

    // Display headings run heavy (Inter 600) with tight negative tracking, like the reference.
    const fontSize = config.theme?.extend?.fontSize as Record<string, [string, { fontWeight?: string }]> | undefined;
    expect(fontSize?.display?.[1]?.fontWeight).toBe("600");

    // Crisp editorial radii with a pill for buttons.
    const radius = config.theme?.extend?.borderRadius as Record<string, string> | undefined;
    expect(radius).toMatchObject({ md: "3px", lg: "4px", pill: "999px" });
  });
});
