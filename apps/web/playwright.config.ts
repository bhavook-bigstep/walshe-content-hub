import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Deterministic e2e: production web build + the API on a throwaway SQLite file, seeded with
// synthetic users, and NO AI keys (the provider layer falls back to its deterministic stub).
const WEB_PORT = 3100;
const API_PORT = 8765; // off the dev default so a running dev API never collides; the web build gets NEXT_PUBLIC_API_URL
const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "../api");
const dbFile = path.join(apiDir, ".e2e-content-hub.db");

const apiEnv = {
  DATABASE_URL: `sqlite+pysqlite:///${dbFile}`,
  JWT_SECRET: "e2e-only-throwaway-secret",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  GEMINI_API_KEY: "",
  // Allow the e2e web origin to call the API directly (real CORS; no brittle route proxy).
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
};

const seedScript = [
  "from app.db import create_all, make_engine, make_sessionmaker",
  "from app.config import get_settings",
  "from app.seed import seed",
  "e = make_engine(get_settings().database_url)",
  "create_all(e)",
  "s = make_sessionmaker(e)()",
  "seed(s)",
  "s.close()",
].join("; ");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 2,
  timeout: 60_000,
  reporter: [["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    acceptDownloads: true,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command:
        `rm -f "${dbFile}" && uv run python -c "${seedScript}" && ` +
        `uv run uvicorn app.main:create_app --factory --port ${API_PORT}`,
      cwd: apiDir,
      url: `http://localhost:${API_PORT}/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${WEB_PORT}`,
      cwd: here,
      url: `http://localhost:${WEB_PORT}/login`,
      env: { NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
