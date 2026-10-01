import type { Config } from "tailwindcss";

// Walshe design system (AC19). Single source of brand tokens, extracted from walshegroup.com
// computed styles (see docs/design/ui-brief.md §3). CSS vars in app/globals.css mirror these for
// use outside Tailwind; the token values live here as the canonical theme. A Vitest test
// (tests/theme.test.ts) asserts this config exposes the §3 palette.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        walshe: {
          // §3 palette — read from the live site.
          teal: "#005653", // primary: nav, buttons, headings on light
          mint: "#E5F6DF", // text on teal, selected/hover tints
          stone: "#ECEBE8", // page + card-alt surface
          ink: "#000000", // headings, strong text
          grey: "#737373", // captions, helper text (min contrast — do not lighten)
          white: "#FFFFFF", // card surface
          green: "#00AE41", // icon/chart accent + status "approved" (never body text on white)
          // Derived (AI-generated, labelled in the brief).
          "teal-700": "#003E3C", // hover / pressed
          "teal-100": "#CFE6E3", // tint
          danger: "#B3261E",
          warn: "#8A5A00",
        },
      },
      fontFamily: {
        // Founders Grotesk is a paid Klim face (not bundled). Inter ships as the licensed fallback
        // via next/font; swap in licensed WOFF2 without code changes. Lato for small UI text.
        sans: [
          "var(--font-sans)",
          "Founders Grotesk",
          "Helvetica Neue",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        ui: ["var(--font-ui)", "Lato", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Scale from §3 (size / line-height).
        display: ["3.5rem", { lineHeight: "3.75rem", fontWeight: "300" }],
        h1: ["2.5rem", { lineHeight: "2.75rem", fontWeight: "300" }],
        h2: ["1.75rem", { lineHeight: "2.125rem", fontWeight: "400" }],
        h3: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "700" }],
        body: ["1rem", { lineHeight: "1.625rem" }],
        small: ["0.875rem", { lineHeight: "1.25rem" }],
      },
      borderRadius: {
        sm: "6px",
        md: "12px",
        pill: "999px",
      },
      boxShadow: {
        // 1px stone border first; soft shadow only on hover/overlays.
        soft: "0 8px 24px rgb(0 86 83 / 0.08)",
      },
      spacing: {
        // 4px base scale extensions used by the layout grid.
        13: "3.25rem",
        18: "4.5rem",
        30: "7.5rem",
      },
      maxWidth: {
        content: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
