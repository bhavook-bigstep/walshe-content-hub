import type { Config } from "tailwindcss";

// Walshe Content Hub design system (AC19). Single source of brand tokens.
// Direction v2 ("vita" language, user-approved): editorial, photo-led, Inter display, an amber
// accent over deep-teal ink on white/off-white, pill buttons, large rounded cards, smooth motion.
// CSS vars in app/globals.css mirror these for non-Tailwind consumers (inline styles, charts).
// A Vitest test (tests/theme.test.ts) asserts this config exposes the palette.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tokens are CSS vars (RGB channels) so they swap per theme (light/dark) AND still support
        // Tailwind opacity modifiers like bg-walshe-deep/30. Values live in app/globals.css.
        walshe: {
          base: "rgb(var(--walshe-base) / <alpha-value>)",
          deep: "rgb(var(--walshe-deep) / <alpha-value>)",
          ink: "rgb(var(--walshe-ink) / <alpha-value>)",
          white: "rgb(var(--walshe-white) / <alpha-value>)",
          paper: "rgb(var(--walshe-paper) / <alpha-value>)",
          mist: "rgb(var(--walshe-mist) / <alpha-value>)",
          stone: "rgb(var(--walshe-stone) / <alpha-value>)",
          line: "rgb(var(--walshe-line) / <alpha-value>)",
          mint: "rgb(var(--walshe-mint) / <alpha-value>)",
          gold: "rgb(var(--walshe-gold) / <alpha-value>)",
          teal: "rgb(var(--walshe-teal) / <alpha-value>)",
          "teal-700": "rgb(var(--walshe-teal-700) / <alpha-value>)",
          grey: "rgb(var(--walshe-grey) / <alpha-value>)",
          green: "rgb(var(--walshe-green) / <alpha-value>)",
          danger: "rgb(var(--walshe-danger) / <alpha-value>)",
          warn: "rgb(var(--walshe-warn) / <alpha-value>)",
        },
        // App chrome (sidebar / top bar) — fg flips with the theme so white-on-dark becomes
        // dark-on-light. Use text-chrome-fg / bg-chrome-bg / bg-chrome-fg/10 etc.
        chrome: {
          bg: "rgb(var(--chrome-bg) / <alpha-value>)",
          fg: "rgb(var(--chrome-fg) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Inter everywhere — body, UI, and display — matching the reference's single-family system.
        sans: ["var(--font-sans)", "Inter", "Helvetica Neue", "system-ui", "sans-serif"],
        ui: ["var(--font-ui)", "var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Heavy, tightly-tracked grotesque scale (Inter) — the reference runs display at ~600
        // weight with strong negative tracking (its hero is Inter 600 at ~-0.066em).
        display: ["5rem", { lineHeight: "0.98", fontWeight: "600", letterSpacing: "-0.055em" }],
        h1: ["2.75rem", { lineHeight: "1.05", fontWeight: "600", letterSpacing: "-0.04em" }],
        h2: ["2.1rem", { lineHeight: "1.1", fontWeight: "600", letterSpacing: "-0.035em" }],
        h3: ["1.3125rem", { lineHeight: "1.3", fontWeight: "600", letterSpacing: "-0.02em" }],
        body: ["1rem", { lineHeight: "1.6" }],
        small: ["0.875rem", { lineHeight: "1.35" }],
        eyebrow: ["0.78rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "0.16em" }],
      },
      borderRadius: {
        // Crisp, editorial corners (reference uses near-zero radius on media/cards). Pills stay round.
        sm: "2px",
        md: "3px",
        lg: "4px",
        xl: "6px",
        "2xl": "8px",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 10px 30px -18px rgb(7 20 24 / 0.28)",
        lift: "0 26px 50px -30px rgb(7 20 24 / 0.40)",
        card: "0 1px 0 rgb(7 20 24 / 0.04)",
      },
      spacing: { 13: "3.25rem", 18: "4.5rem", 30: "7.5rem" },
      maxWidth: { content: "1200px" },
    },
  },
  plugins: [],
};

export default config;
