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

    // Core palette — the approved direction's brand tokens.
    expect(walshe).toMatchObject({
      amber: "#FBA13A",
      ink: "#071418",
      teal: "#0D2E37",
      paper: "#FFFFFF",
      grey: "#5D6C7B",
      green: "#0FA37F",
    });

    // Inter carries the type system.
    const fontFamily = config.theme?.extend?.fontFamily as Record<string, string[]> | undefined;
    expect(fontFamily?.sans).toContain("Inter");

    // Crisp editorial radii with a pill for buttons.
    const radius = config.theme?.extend?.borderRadius as Record<string, string> | undefined;
    expect(radius).toMatchObject({ md: "3px", lg: "4px", pill: "999px" });
  });
});
