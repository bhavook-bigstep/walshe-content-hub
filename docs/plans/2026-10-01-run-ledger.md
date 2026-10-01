# Run ledger — Walsh Content Hub PoC

Durable state for a `/oneshot-poc:run`. **Every phase reads this first and appends to it when
done.** Content-free: status and decisions only, never secrets/PII.

- **Governing spec:** `/REQUIREMENTS.md` (v1.0.0, ACTIVE) — the acceptance contract the loop verifies against · **Charter (scoping record):** `docs/plans/2026-10-01-requirements-charter.md` (v2) · **Branch:** `feat/content-hub-poc`
- **Current phase:** `IMPLEMENT` (inner-iter 1 in progress — §1 governance mechanism landed; P1 app scaffold still to build)
- **Outer loop:** `0/3` · **Inner loop:** `1/2`
- **Plan:** `docs/plans/2026-10-01-implementation-plan.md` — exact files/functions/config + dependency graph + one proof test per AC; governance mechanism (Approach D) specified under §1/AC18.

## Requirement status (the acceptance checklist)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC1 | 3-role login + RBAC | planned | test_auth_rbac.py::test_role_guard_blocks_wrong_role |
| AC2 | Super Admin: users/tenants + approve provider | planned | test_admin.py::test_approve_provider_flips_flag |
| AC3 | Provider: create catalog entries (event/place/opportunity + offer/itinerary) | planned | test_catalog_crud.py::test_create_entry_each_type |
| AC4 | Provider: upload image → MinIO → served | planned | test_assets.py::test_upload_then_fetch (MinIO mocked) |
| AC5 | Provider: mark brand-safe + set access | planned | test_catalog_access.py::test_set_brand_safe_and_access_scope |
| AC6 | Agents only see approved brand-safe entries (CONTRACT) | planned | test_visibility_contract.py::test_agent_never_sees_unapproved (via agent_visible_q) |
| AC7 | Agent: browse/search/filter + compose | planned | test_catalog_search.py::test_filter_by_destination_and_type |
| AC8 | Design Studio: pick format (social/story/pamphlet) | planned | web formats.test.ts::test_format_presets |
| AC9 | Studio manual: text/shapes/bg + catalog images; multi-page | planned | web studio-ops.test.ts::test_manual_ops_mutate_design |
| AC10 | Builder AI agent: generate/edit design from prompt+catalog | planned | test_builder.py::test_builder_stub_is_deterministic |
| AC11 | Personalize: logo/contact/offer | planned | web personalize.test.ts::test_apply_branding_adds_nodes |
| AC12 | Export PNG + PDF + email HTML | planned | test_export.py::test_pdf_and_html_from_design |
| AC13 | Rudimentary video MP4 (demo-video mechanism) | planned | test_video.py::test_scene_script_deterministic_and_cmd_shape (ffmpeg/TTS mocked) |
| AC14 | Social: schedule/publish (simulated) | planned | test_social.py::test_schedule_then_publish_transitions |
| AC15 | Engagement dashboard (seeded metrics) | planned | test_engagement.py::test_dashboard_returns_seeded_metrics |
| AC16 | AI provider abstraction (3 providers, env keys, mocked) | planned | test_ai_provider.py::test_factory_selects_and_falls_back |
| AC17 | docker compose up + seed script | planned | test_seed.py::test_seed_is_idempotent_and_complete |
| AC18 | Tests pass (pytest + vitest + Playwright smoke) + acceptance matrix green | partial | Governance harness landed + green (scripts/tests/* 20 passing; sync guard PASS). App suites + e2e still to build → matrix currently 1 partial / 17 missing (honest). |

Priority tiers: **P1** = AC1,3,4,6,7,8,9,12,16,17,18 · **P2** = AC10,11,13 · **P3** = AC2,5,14,15.

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | Charter v2 confirmed; stack locked in CLAUDE.md; git repo + branch created | — |
| B (brainstorm, outer 0/3 · inner 0/2) | Brainstormed how the top-level requirements file is *governed* + *governs* (user ask); 4 cited approaches → `docs/brainstorms/2026-10-01-governing-requirements-file.md` | Chose **D — hybrid**: keep `/REQUIREMENTS.md` as the governed human source of truth, add a thin generated met/partial/missing status matrix enforced in CI + acceptance (folds into AC18). No AC scope change → no version bump. Requirement-status matrix below unchanged (all AC still `todo`). |
| C (plan, outer 0/3 · inner 0/2) | Wrote concrete build plan → `docs/plans/2026-10-01-implementation-plan.md`: monorepo scaffold, exact files/functions/config per AC, dependency graph (critical path scaffold→AC1/AC3→AC6→AC7→AC8→AC9→AC12→AC17→AC18), one proof test per AC. Carried Approach D into §1/AC18 as the user's governing-file mechanism: `/requirements.manifest.yaml` (AC→test node-ids) + `scripts/acceptance_matrix.py` (`--check` reds the build on an unproven AC) + `scripts/check_requirements_sync.py` (spec↔manifest drift guard) wired into `.github/workflows/ci.yml`. | Plan complete. All 18 AC → `planned` with named proof tests (see matrix). Synthetic fixtures/stub-AI/mocked boundaries for determinism; no secrets (keys from env). No AC scope change → `/REQUIREMENTS.md` stays v1.0.0, no version bump. Next: `/oneshot-poc:implement` inner-iter 1 (P1 core + AC18 harness). |

| IMPLEMENT (outer 0/3 · inner 1/2) | Implemented §1 — the user's governing-requirements mechanism — as the first unit of inner-iter 1. Added top-level **`/requirements.manifest.yaml`** (AC1–AC18 → proof node-ids + tiers), **`scripts/acceptance_matrix.py`** (`load_manifest`/`collect_results`/`evaluate`/`render_markdown`/`--check`/`--write-ledger`; tolerant pytest/vitest/Playwright report parsers), **`scripts/check_requirements_sync.py`** (spec↔manifest drift guard), their tests (`scripts/tests/*`), and **`.github/workflows/ci.yml`** (governance job always-on; api/web jobs guarded on app dirs; acceptance job maps proofs → `--check` once suites exist). The generated matrix block below is written by `--write-ledger` (never hand-edited). | **Gates (real):** `pytest scripts/tests` → **20 passed**; `check_requirements_sync` → **PASS (18 in sync)**; demonstrated matrix moves AC18 `missing→partial (2/3)` when its real governance proofs are fed in, e2e proof honestly still missing. No AC scope change → `/REQUIREMENTS.md` stays v1.0.0, no version bump. **Remaining inner-iter 1:** P1 app scaffold + AC1/AC3/AC4/AC6/AC7/AC8/AC9/AC12/AC16/AC17 code+tests (not built this unit). |

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
| AC1 | P1 | missing | 0/1 |
| AC2 | P3 | missing | 0/1 |
| AC3 | P1 | missing | 0/1 |
| AC4 | P1 | missing | 0/1 |
| AC5 | P3 | missing | 0/1 |
| AC6 | P1 | missing | 0/1 |
| AC7 | P1 | missing | 0/1 |
| AC8 | P1 | missing | 0/1 |
| AC9 | P1 | missing | 0/1 |
| AC10 | P2 | missing | 0/1 |
| AC11 | P2 | missing | 0/1 |
| AC12 | P1 | missing | 0/1 |
| AC13 | P2 | missing | 0/1 |
| AC14 | P3 | missing | 0/1 |
| AC15 | P3 | missing | 0/1 |
| AC16 | P1 | missing | 0/1 |
| AC17 | P1 | missing | 0/1 |
| AC18 | P1 | missing | 0/3 |

**Totals:** 0 met · 0 partial · 18 missing · 18 total.

<!-- END GENERATED ACCEPTANCE MATRIX -->
