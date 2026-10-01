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
        walshe: {
          // The Walshe Group green as the base (deep teal-green), light off-white text, mint accent.
          base: "#005653", // page background — the Walshe green
          deep: "#003E3C", // deeper teal — glass nav, recessed
          ink: "#EAF4F1", // primary text (light off-white)
          white: "#FFFFFF",
          paper: "#005653",
          mist: "#005653", // section bg = base
          stone: "#0C6A64", // subtle raised surface
          line: "#15766F", // hairline borders on teal
          mint: "#E5F6DF", // accent — eyebrows, active, highlights
          teal: "#005653", // brand (text on white pills / chips)
          "teal-700": "#003E3C",
          grey: "#A7C6C2", // muted text (light)
          green: "#4FCAA0", // success
          danger: "#E06A63",
          warn: "#E0B24A",
        },
      },
      fontFamily: {
        // Inter for UI/body; an elegant serif for display headings (Walshe's identity).
        sans: ["var(--font-sans)", "Inter", "Helvetica Neue", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Playfair Display", "Georgia", "Times New Roman", "serif"],
        ui: ["var(--font-ui)", "var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Light, editorial grotesque scale (Inter) — big and airy, not heavy.
        display: ["5rem", { lineHeight: "0.98", fontWeight: "300", letterSpacing: "-0.035em" }],
        h1: ["2.75rem", { lineHeight: "1.05", fontWeight: "500", letterSpacing: "-0.025em" }],
        h2: ["2.1rem", { lineHeight: "1.1", fontWeight: "500", letterSpacing: "-0.02em" }],
        h3: ["1.3125rem", { lineHeight: "1.3", fontWeight: "600", letterSpacing: "-0.01em" }],
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
