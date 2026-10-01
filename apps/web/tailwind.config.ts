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
          // Core
          amber: "#FBA13A", // primary accent — CTAs, highlights, active state
          "amber-600": "#EA8A26", // hover / pressed
          ink: "#071418", // headings + body text, near-black deep teal
          teal: "#0D2E37", // dark surfaces — sidebar, dark sections
          "teal-800": "#143F4B", // raised on dark
          "teal-700": "#0A2129", // deepest
          "teal-100": "#E6EEF0", // light teal tint (hover on light)
          paper: "#FFFFFF", // primary surface
          white: "#FFFFFF",
          mist: "#F4F5F4", // off-white section background
          stone: "#EEF0EF", // borders + alt surface
          line: "#E7E9E8", // hairline dividers
          mint: "#E8F3EF", // light tint (chips, pills on light)
          grey: "#5D6C7B", // muted / caption text
          green: "#0FA37F", // verified / success accent
          danger: "#B3261E",
          warn: "#8A5A00",
        },
      },
      fontFamily: {
        // Inter carries the whole system (display + body), matching the approved direction.
        sans: ["var(--font-sans)", "Inter", "Helvetica Neue", "system-ui", "sans-serif"],
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
