import { defineConfig } from "vitest/config";

// Studio logic is pure (serialisable design model), so the default node environment is enough —
// no jsdom/canvas needed. Canvas rendering is covered by the Playwright e2e smoke (AC18).
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
