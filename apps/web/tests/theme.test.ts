import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../tailwind.config";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

// AC19 — the Walshe design system is defined once in the central theme and exposes the brand
// tokens. Tokens are now CSS variables (so they can theme), consumed via rgb(var(--…)).
describe("walshe design tokens", () => {
  it("test_theme_exposes_walshe_tokens", () => {
    const colors = config.theme?.extend?.colors as Record<string, Record<string, string>> | undefined;
    expect(colors).toBeDefined();
    const walshe = colors!.walshe;
    expect(walshe).toBeDefined();

    // Tokens are CSS-var driven (theme-aware) and still cover the core roles.
    for (const key of ["base", "deep", "ink", "mint", "teal", "white", "grey", "line", "stone"]) {
      expect(walshe[key]).toContain(`var(--walshe-${key}`);
    }
    // Chrome tokens exist (sidebar / top bar flip with the theme).
    const chrome = colors!.chrome;
    expect(chrome?.bg).toContain("var(--chrome-bg");
    expect(chrome?.fg).toContain("var(--chrome-fg");

    // Inter everywhere; a serif is not used.
    const fontFamily = config.theme?.extend?.fontFamily as Record<string, string[]> | undefined;
    expect(fontFamily?.sans).toContain("Inter");
    expect(fontFamily?.serif).toBeUndefined();

    // Display headings run heavy (Inter 600).
    const fontSize = config.theme?.extend?.fontSize as Record<string, [string, { fontWeight?: string }]> | undefined;
    expect(fontSize?.display?.[1]?.fontWeight).toBe("600");

    // Crisp editorial radii with a pill for buttons.
    const radius = config.theme?.extend?.borderRadius as Record<string, string> | undefined;
    expect(radius).toMatchObject({ md: "3px", lg: "4px", pill: "999px" });
  });
});

// AC30 — both a dark and a light palette are defined as token sets (RGB channels), so the whole
// app can switch themes from one place.
describe("light and dark themes", () => {
  it("test_light_and_dark_palettes_defined", () => {
    // Dark is the default on :root; light overrides it under [data-theme="light"].
    expect(css).toMatch(/:root\s*\{[^}]*--walshe-base:\s*3 22 15/);
    expect(css).toMatch(/\[data-theme="light"\]\s*\{[^}]*--walshe-base:\s*244 246 245/);
    // The primary text token flips between the themes.
    expect(css).toMatch(/\[data-theme="light"\]\s*\{[^}]*--walshe-ink:\s*14 42 38/);
    // Chrome flips too.
    expect(css).toMatch(/\[data-theme="light"\]\s*\{[^}]*--chrome-bg:\s*255 255 255/);
  });
});
