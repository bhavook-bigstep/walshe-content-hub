#!/usr/bin/env node
// Generate packages/shared/openapi.json + src/api-types.ts from the FastAPI Pydantic models.
// Finding F1 / plan 10.1: the TS contract is derived, never hand-written.
//
// Usage: node scripts/gen-api-types.mjs [--out-dir DIR]
//   default DIR = packages/shared  (openapi.json at DIR/openapi.json, types at DIR/src/api-types.ts)
// Env: PYTHON (interpreter that can import apps/api deps; default "python3").
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const i = argv.indexOf("--out-dir");
const outDir = resolve(i >= 0 ? argv[i + 1] : join(root, "packages", "shared"));
const openapi = join(outDir, "openapi.json");
const types = join(outDir, "src", "api-types.ts");

mkdirSync(join(outDir, "src"), { recursive: true });
const python = process.env.PYTHON || "python3";
execFileSync(python, [join(root, "scripts", "dump_openapi.py"), openapi], { stdio: "inherit" });
const bin = process.platform === "win32" ? "npx.cmd" : "npx";
execFileSync(bin, ["--yes", "openapi-typescript", openapi, "-o", types], { stdio: "inherit" });
console.log(`generated ${openapi} and ${types}`);
