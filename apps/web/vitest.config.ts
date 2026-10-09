import { defineConfig } from "vitest/config";

// Studio logic is pure (serialisable design model), so the default node environment is enough —
// no jsdom/canvas needed. Canvas rendering is covered by the Playwright e2e smoke (AC18).
// A few `.test.tsx` suites render React panels to static markup (react-dom/server, no jsdom) to
// assert their control contract; `jsx: "automatic"` lets esbuild transform those without a plugin.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
