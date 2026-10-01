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
        // Bold, tight editorial scale (Inter).
        display: ["4.25rem", { lineHeight: "1.03", fontWeight: "800", letterSpacing: "-0.02em" }],
        h1: ["3rem", { lineHeight: "1.05", fontWeight: "800", letterSpacing: "-0.02em" }],
        h2: ["2.25rem", { lineHeight: "1.08", fontWeight: "700", letterSpacing: "-0.02em" }],
        h3: ["1.3125rem", { lineHeight: "1.3", fontWeight: "700", letterSpacing: "-0.01em" }],
        body: ["1rem", { lineHeight: "1.6" }],
        small: ["0.875rem", { lineHeight: "1.35" }],
        eyebrow: ["0.78rem", { lineHeight: "1.2", fontWeight: "700", letterSpacing: "0.16em" }],
      },
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "22px",
        xl: "28px",
        "2xl": "34px",
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
