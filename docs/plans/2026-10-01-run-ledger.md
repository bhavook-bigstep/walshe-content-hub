# Run ledger — Walsh Content Hub PoC

Durable state for a `/oneshot-poc:run`. **Every phase reads this first and appends to it when
done.** Content-free: status and decisions only, never secrets/PII.

- **Governing spec:** `/REQUIREMENTS.md` (v1.0.0, ACTIVE) — the acceptance contract the loop verifies against · **Charter (scoping record):** `docs/plans/2026-10-01-requirements-charter.md` (v2) · **Branch:** `feat/content-hub-poc`
- **Current phase:** `IMPLEMENT` (inner-iter 1 in progress — §1 governance + the P1 **API** core + the P1 **web studio slice (AC8/AC9)** landed & green; P2/P3 + Playwright e2e still to build)
- **Outer loop:** `0/3` · **Inner loop:** `1/2`
- **Plan:** `docs/plans/2026-10-01-implementation-plan.md` — exact files/functions/config + dependency graph + one proof test per AC; governance mechanism (Approach D) specified under §1/AC18. **Revised 2026-10-01 (PLAN re-pass):** added a plan-status note (§1 landed + green), a system-contracts→proofs map (§6a), and a governance observation that Contract 3 has no dedicated AC. **Revised 2026-10-01 (PLAN re-pass #2):** verified every AC row against the built P1 API core; recorded the as-built divergence (`Base.metadata.create_all`, Alembic deferred) in §2/AC17; restated the forward plan (web slice + P2 + P3 + e2e). No AC scope change.

## Requirement status (the acceptance checklist)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC1 | 3-role login + RBAC | met | test_auth_rbac.py::test_role_guard_blocks_wrong_role PASS (agent→403, admin→200, no-token→401) |
| AC2 | Super Admin: users/tenants + approve provider | met | test_admin.py::test_approve_provider_flips_flag PASS (non-admin→403, approve flips flag) |
| AC3 | Provider: create catalog entries (event/place/opportunity + offer/itinerary) | met | test_catalog_crud.py::test_create_entry_each_type PASS (all 5 types; invalid→422) |
| AC4 | Provider: upload image → MinIO → served | met | test_assets.py::test_upload_then_fetch PASS (Storage interface; in-memory fake in tests, MinIO backend when configured) |
| AC5 | Provider: mark brand-safe + set access | met | test_catalog_access.py::test_set_brand_safe_and_access_scope PASS (tenant-scope reflected in agent visibility) |
| AC6 | Agents only see approved brand-safe entries (CONTRACT) | met | test_visibility_contract.py::test_agent_never_sees_unapproved PASS (single choke-point services/visibility.py; draft/unsafe/out-of-scope all 404) |
| AC7 | Agent: browse/search/filter + compose | met | test_catalog_search.py::test_filter_by_destination_and_type PASS (destination/type/q filters via agent_visible_entries) |
| AC8 | Design Studio: pick format (social/story/pamphlet) | met | test formats.test.ts::test_format_presets PASS (vitest; FORMAT_PRESETS social 1080² / story 1080×1920 / pamphlet 1240×1754 multi-page; unknown format throws) |
| AC9 | Studio manual: text/shapes/bg + catalog images; multi-page | met | test studio-ops.test.ts::test_manual_ops_mutate_design PASS (vitest; pure immutable ops over serialisable design model matching the API export shape; deterministic node ids; add/move/resize/edit + addPage) |
| AC10 | Builder AI agent: generate/edit design from prompt+catalog | planned | test_builder.py::test_builder_stub_is_deterministic (P2, inner-iter 2) |
| AC11 | Personalize: logo/contact/offer | planned | web personalize.test.ts::test_apply_branding_adds_nodes (P2, inner-iter 2) |
| AC12 | Export PNG + PDF + email HTML | met | test_export.py::test_pdf_and_html_from_design PASS (reportlab multi-page PDF + escaped email HTML; no key leaks). **PNG export is client-side (Fabric toDataURL) — proven by web/e2e, not yet built.** |
| AC13 | Rudimentary video MP4 (demo-video mechanism) | planned | test_video.py::test_scene_script_deterministic_and_cmd_shape (P2, inner-iter 2) |
| AC14 | Social: schedule/publish (simulated) | planned | test_social.py::test_schedule_then_publish_transitions (P3) |
| AC15 | Engagement dashboard (seeded metrics) | planned | test_engagement.py::test_dashboard_returns_seeded_metrics (P3) |
| AC16 | AI provider abstraction (3 providers, env keys, mocked) | met | test_ai_provider.py::test_factory_selects_and_falls_back PASS (claude/openai/gemini + stub fallback, no network, httpx guarded) |
| AC17 | docker compose up + seed script | met | test_seed.py::test_seed_is_idempotent_and_complete PASS (idempotent; one user/role; ≥1 approved brand-safe). infra/docker-compose.yml + apps/api/Dockerfile + .env.example added (compose not runtime-verified in this env). |
| AC18 | Tests pass (pytest + vitest + Playwright smoke) + acceptance matrix green | partial | Governance harness green (scripts/tests 20 PASS; sync PASS) + api suite 17 PASS + **web vitest 2 PASS** now feeding the matrix (12 AC met). **Playwright e2e smoke still to build** → AC18 honestly `missing` in the generated matrix (0/3 its own proofs: the two governance tests run in a separate report, and the e2e does not yet exist). |
| — (C3) | Destructive actions traceable (system contract, no AC) | met (unmatrixed) | test_audit.py::test_destructive_actions_are_logged PASS (delete writes AuditLog). Still not wired to any AC — user decision on AC19 vs fold-into-AC6 remains open (plan §6a). |

Priority tiers: **P1** = AC1,3,4,6,7,8,9,12,16,17,18 · **P2** = AC10,11,13 · **P3** = AC2,5,14,15.

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | Charter v2 confirmed; stack locked in CLAUDE.md; git repo + branch created | — |
| B (brainstorm, outer 0/3 · inner 0/2) | Brainstormed how the top-level requirements file is *governed* + *governs* (user ask); 4 cited approaches → `docs/brainstorms/2026-10-01-governing-requirements-file.md` | Chose **D — hybrid**: keep `/REQUIREMENTS.md` as the governed human source of truth, add a thin generated met/partial/missing status matrix enforced in CI + acceptance (folds into AC18). No AC scope change → no version bump. Requirement-status matrix below unchanged (all AC still `todo`). |
| C (plan, outer 0/3 · inner 0/2) | Wrote concrete build plan → `docs/plans/2026-10-01-implementation-plan.md`: monorepo scaffold, exact files/functions/config per AC, dependency graph (critical path scaffold→AC1/AC3→AC6→AC7→AC8→AC9→AC12→AC17→AC18), one proof test per AC. Carried Approach D into §1/AC18 as the user's governing-file mechanism: `/requirements.manifest.yaml` (AC→test node-ids) + `scripts/acceptance_matrix.py` (`--check` reds the build on an unproven AC) + `scripts/check_requirements_sync.py` (spec↔manifest drift guard) wired into `.github/workflows/ci.yml`. | Plan complete. All 18 AC → `planned` with named proof tests (see matrix). Synthetic fixtures/stub-AI/mocked boundaries for determinism; no secrets (keys from env). No AC scope change → `/REQUIREMENTS.md` stays v1.0.0, no version bump. Next: `/oneshot-poc:implement` inner-iter 1 (P1 core + AC18 harness). |

| PLAN (re-pass, outer 0/3 · inner 1/2) | Re-verified the implementation plan against the governed spec: all 18 AC rows still hold (exact files/functions/config + dependency graph + one proof test each), and §1 — the user's "store the final requirements in a separate top-level file that can be *governed* and *govern*" ask — confirmed landed + green (`/REQUIREMENTS.md` v1.0.0 + `/requirements.manifest.yaml` + `scripts/acceptance_matrix.py` + `scripts/check_requirements_sync.py` + `.github/workflows/ci.yml`). Revised `docs/plans/2026-10-01-implementation-plan.md`: plan-status note; new §6a mapping system contracts C1–C4 → named proofs; flagged that **Contract 3 (destructive-action traceability) has no dedicated AC** so it is tested (`test_audit.py`) but not enforced by the acceptance matrix. | **Gates re-run (real):** `pytest scripts/tests` → **20 passed**; `check_requirements_sync` → **PASS (18 in sync)**. **Requirement-status matrix unchanged** (no app code landed this pass): AC1–AC17 `planned` with named proofs, AC18 `partial` (governance harness green; app suites + e2e still to build). Generated matrix still 0 met · 0 partial · 18 missing (honest — no app proofs feed it yet). **Governance decision deferred to user:** add `AC19` for audit (recommended), fold audit proof into AC6, or accept C3 as tested-but-unmatrixed — any is a spec edit → version bump + change-log + approval, so **no scope change made**; `/REQUIREMENTS.md` stays v1.0.0. Next: resume `/oneshot-poc:implement` inner-iter 1 — P1 app scaffold + AC1/AC3/AC4/AC6/AC7/AC8/AC9/AC12/AC16/AC17 code+tests. |
| IMPLEMENT (outer 0/3 · inner 1/2) | Implemented §1 — the user's governing-requirements mechanism — as the first unit of inner-iter 1. Added top-level **`/requirements.manifest.yaml`** (AC1–AC18 → proof node-ids + tiers), **`scripts/acceptance_matrix.py`** (`load_manifest`/`collect_results`/`evaluate`/`render_markdown`/`--check`/`--write-ledger`; tolerant pytest/vitest/Playwright report parsers), **`scripts/check_requirements_sync.py`** (spec↔manifest drift guard), their tests (`scripts/tests/*`), and **`.github/workflows/ci.yml`** (governance job always-on; api/web jobs guarded on app dirs; acceptance job maps proofs → `--check` once suites exist). The generated matrix block below is written by `--write-ledger` (never hand-edited). | **Gates (real):** `pytest scripts/tests` → **20 passed**; `check_requirements_sync` → **PASS (18 in sync)**; demonstrated matrix moves AC18 `missing→partial (2/3)` when its real governance proofs are fed in, e2e proof honestly still missing. No AC scope change → `/REQUIREMENTS.md` stays v1.0.0, no version bump. **Remaining inner-iter 1:** P1 app scaffold + AC1/AC3/AC4/AC6/AC7/AC8/AC9/AC12/AC16/AC17 code+tests (not built this unit). |
| IMPLEMENT (outer 0/3 · inner 1/2) — **P1 API core** | Built the **FastAPI `apps/api`** app (uv, py3.12) implementing the API-side P1 (+ two cheap P3) acceptance items with hermetic, deterministic tests. New: app factory/config/db/security/deps; models (user/tenant, catalog+asset, composition, audit); `services/visibility.py` (the single Contract-1 choke-point); `storage/minio_client.py` (Storage interface + in-memory fake + lazy MinIO); `ai/` provider abstraction (base/stub/claude/openai/gemini/factory, httpx-based, keys from env, stub fallback); `media/pdf.py`+`html_export.py`; routers (auth/admin/catalog/assets/render); idempotent `seed.py`. Added `infra/docker-compose.yml`, `apps/api/Dockerfile`, `.env.example` (names only). Proof tests for AC1,2,3,4,5,6,7,12,16,17 + `test_audit.py` (C3). **Fixed a real governance-integration bug:** CI `api` job now runs pytest from the repo root with `--rootdir` pinned so json-report node-ids are repo-relative and actually match the manifest (they did not before). | **Gates (real, this env):** `ruff check` → **All checks passed**; api `pytest` → **17 passed** (0 fail); app boot smoke OK (uvicorn `--factory` target, 10 routes); governance `pytest scripts/tests` → **20 passed**; sync guard → **PASS (18 in sync)**. **Acceptance matrix regenerated from the real api report → 10 AC met (AC1-7,12,16,17) · 0 partial · 8 missing.** AC8/AC9 (web vitest), AC10/11/13 (P2), AC14/15 (P3), AC18 (needs web+e2e) remain honestly `missing`. No AC scope change → `/REQUIREMENTS.md` stays v1.0.0. **Next unit:** web studio slice (AC8/AC9 vitest) → then P2 AI-wow. |

| PLAN (re-pass #2, outer 0/3 · inner 1/2) | Re-verified the implementation plan against the code now on disk after the P1 API core landed. Confirmed every per-AC row still holds: the built `apps/api` (visibility choke-point, AI abstraction + stub fallback, MinIO Storage interface, reportlab PDF + escaped email HTML, idempotent seed, audit log) matches the plan's named files/functions/tests. **Recorded one as-built divergence in the plan (§2 + AC17): schema uses `app/db.py:create_all` (`Base.metadata.create_all`) — Alembic is intentionally deferred for the PoC and is not a dependency** (`apps/api/app/db.py:28-33`). Updated the plan's status note to reflect P1 API core green + 10/18 met, and restated the forward plan (web slice AC8/9/11/12-PNG, P2 AC10/13, P3 AC14/15, root scaffold, Playwright e2e for AC18). The user's standing ask — a governed + governing top-level requirements file — remains satisfied by `/REQUIREMENTS.md` + `/requirements.manifest.yaml` + the two scripts + CI. | **Gates re-run (real, this env):** api `pytest` → **17 passed**; governance `pytest scripts/tests` → **20 passed**; `check_requirements_sync` → **PASS (18 in sync)**. **Requirement-status matrix unchanged** (no app code landed this pass): generated matrix stays **10 met (AC1-7,12,16,17) · 0 partial · 8 missing**. Contract-3 governance question (AC19 vs fold-into-AC6 vs accept-as-unmatrixed) remains deferred to the user — no scope change made, `/REQUIREMENTS.md` stays v1.0.0, no version bump. **Next:** resume `/oneshot-poc:implement` — web studio slice (AC8/AC9 vitest) then P2 AI-wow. |
| IMPLEMENT (outer 0/3 · inner 1/2) — **P1 web studio slice (AC8/AC9)** | Built the **`apps/web` Design-Studio logic slice** per plan §AC8/§AC9. New files: `apps/web/lib/studio/formats.ts` (`FORMAT_PRESETS` social 1080² / story 1080×1920 / pamphlet 1240×1754 multi-page + `getFormatPreset`/`isFormatName` guards) and `apps/web/lib/studio/ops.ts` (pure, **immutable**, deterministic ops over a serialisable design model — `newDesign`/`addText`/`addShape`/`setBackground`/`addCatalogImage`/`addPage`/`moveNode`/`resizeNode`/`editText`). The design model is the **exact shape the API PDF/HTML export already consumes** (`{"pages":[{"nodes":[{"type":"text","text":…}]}]}`), so client studio ↔ server render agree. Node ids are derived from page node-count (no `Math.random`/`Date.now`) for Contract-4 determinism; `addCatalogImage` carries `catalogItemId` provenance so only approved assets (Contract 1) enter a design. Added `apps/web/package.json` (vitest + typescript, standalone pnpm package), `tsconfig.json` (strict), `vitest.config.ts` (node env — studio logic is pure, no canvas/jsdom needed; canvas rendering deferred to the e2e smoke per plan §7 risk). Proof tests: `tests/formats.test.ts::test_format_presets`, `tests/studio-ops.test.ts::test_manual_ops_mutate_design` (node-ids match the manifest exactly). No Next.js app shell / Fabric components built this unit (not needed for the AC8/AC9 vitest proofs; the app shell + canvas ride with the AC18 e2e later). No AC scope change → `/REQUIREMENTS.md` stays v1.0.0. | **Gates (real, this env):** web `tsc --noEmit` → **0 errors**; `vitest run` → **2 passed**; api `ruff check` → **All checks passed**; api `pytest` (repo-root rootdir, json report) → **17 passed**; governance `pytest scripts/tests` → **20 passed**; `check_requirements_sync` → **PASS (18 in sync)**. **Acceptance matrix regenerated from the real api + web reports → 12 met (added AC8, AC9) · 0 partial · 6 missing.** Remaining missing: AC10/AC11/AC13 (P2), AC14/AC15 (P3), AC18 (needs the Playwright e2e smoke — the only blocker now that vitest is green). **Next unit:** P2 AI-wow — AC10 Builder (api, stub-deterministic) + AC13 video (api, ffmpeg mocked) + AC11 personalize (web). |

## Open assumptions / deferrals
- No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` in env → app uses **deterministic stub fallback** at runtime; real-provider paths are built + unit-tested with mocks.
- Social layer simulated (no real OAuth). Auth = simple email+password + role guards. Canvas = Fabric.js.
- Real assets added via the app (Provider catalog UI) after seeded placeholders.

## Blockers (if STUCK)
- (none yet)

## Generated acceptance matrix

<!-- BEGIN GENERATED ACCEPTANCE MATRIX (scripts/acceptance_matrix.py --write-ledger) -->

| # | Tier | Status | Proofs passing |
|---|------|--------|----------------|
| AC1 | P1 | met | 1/1 |
| AC2 | P3 | met | 1/1 |
| AC3 | P1 | met | 1/1 |
| AC4 | P1 | met | 1/1 |
| AC5 | P3 | met | 1/1 |
| AC6 | P1 | met | 1/1 |
| AC7 | P1 | met | 1/1 |
| AC8 | P1 | met | 1/1 |
| AC9 | P1 | met | 1/1 |
| AC10 | P2 | missing | 0/1 |
| AC11 | P2 | missing | 0/1 |
| AC12 | P1 | met | 1/1 |
| AC13 | P2 | missing | 0/1 |
| AC14 | P3 | missing | 0/1 |
| AC15 | P3 | missing | 0/1 |
| AC16 | P1 | met | 1/1 |
| AC17 | P1 | met | 1/1 |
| AC18 | P1 | missing | 0/3 |

**Totals:** 12 met · 0 partial · 6 missing · 18 total.

<!-- END GENERATED ACCEPTANCE MATRIX -->
