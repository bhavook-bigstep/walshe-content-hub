# Implementation Plan — Walsh Content Hub PoC

- **Date:** 2026-10-01 · **Phase:** C (Plan) of `/oneshot-poc:run` · **Outer/Inner:** 0/3 · 0/2
- **Governed spec (acceptance contract):** `/REQUIREMENTS.md` v1.0.0 (AC1–AC18) — this plan conforms to it, never the reverse.
- **Charter (scoping record):** `docs/plans/2026-10-01-requirements-charter.md` v2 · **Ledger:** `docs/plans/2026-10-01-run-ledger.md`
- **Brainstorm decision carried in:** `docs/brainstorms/2026-10-01-governing-requirements-file.md` → **Approach D** (governed Markdown + thin generated status matrix enforced in CI + acceptance).

> **Plan status (revised 2026-10-01, PLAN re-pass #2 — mid-IMPLEMENT).** Two slices have now landed and are green:
> - **§1 — the governed + governing requirements file** (the user's standing ask): `/REQUIREMENTS.md` v1.0.0 + `/requirements.manifest.yaml` + `scripts/acceptance_matrix.py` + `scripts/check_requirements_sync.py` + `.github/workflows/ci.yml`. Gates re-run this pass: `pytest scripts/tests` → **20 passed**; sync guard → **PASS (18 in sync)**.
> - **P1 API core** (`apps/api`): AC1,AC2,AC3,AC4,AC5,AC6,AC7,AC12(server PDF+HTML),AC16,AC17 landed with their proof tests. Gate re-run this pass: api `pytest` → **17 passed**. The generated acceptance matrix stands at **10 met · 0 partial · 8 missing**.
>
> This re-pass verified every per-AC row below against the code now on disk; all rows that have landed match the plan. **One divergence recorded (see §2 / AC17): the stack uses `Base.metadata.create_all` for the PoC, not Alembic migrations.** No AC scope change → `/REQUIREMENTS.md` stays v1.0.0. Live status is tracked only in the run-ledger generated matrix — this file remains the forward HOW, the ledger the status. **Remaining (the forward plan): the `apps/web` slice (AC8, AC9, AC11, AC12 client PNG), P2 API (AC10 Builder, AC13 video), P3 API (AC14 social, AC15 engagement), root scaffold (pnpm/turbo/`packages/shared`), and the Playwright e2e that closes AC18.**

## 0. Intake (restated)

- **Goal.** A concrete, reviewable build plan with exact files/functions/config, a dependency graph, and one test per acceptance item (AC1–AC18), plus the mechanism that makes `/REQUIREMENTS.md` both *governed* and *governing* (the user's standing request).
- **Inputs.** `/REQUIREMENTS.md`, the charter, the run ledger, CLAUDE.md + `.claude/rules/`. Empty code tree (only `docs/`, `.oneshot/`).
- **Method.** Scaffold the monorepo seam-first, build P1 core → P2 AI-wow → P3 surrounding, each AC landing with its test; wire the acceptance matrix into the test gate (AC18).
- **Output.** This plan + an updated ledger matrix. No code is written in this phase.
- **Constraints.** YAGNI/PoC depth; synthetic fixtures only; no secrets (keys from env, stub fallback); deterministic in tests; nothing ships without explicit approval.
- **Environment confirmed this session:** node v26.6.0, python 3.14 (api pins 3.12 via uv), ffmpeg/ffprobe/say/espeak/docker/pnpm/uv all present.

## 1. The governed + governing requirements file (user's standing ask; folds into AC18)

`/REQUIREMENTS.md` already provides the **governed** half (stable IDs, semver, change log, PR/approval). Approach D adds the **governing** half as thin, generated enforcement — no rewrite of the spec:

| New artifact | Path | Purpose |
| --- | --- | --- |
| Proof manifest | `/requirements.manifest.yaml` (top level, beside the spec) | Maps each `AC#` → the test node-ids that prove it (`api`, `web`, `e2e` lists) + `tier` (P1/P2/P3). Machine-readable sidecar; the **only** hand-edited AC↔test link. |
| Matrix generator | `scripts/acceptance_matrix.py` | Reads the three machine test reports → the manifest → emits **met / partial / missing** per AC. `--check` exits non-zero if any AC is not `met`; `--write-ledger` refreshes the matrix block in the run ledger (generated, never hand-edited → mitigates D's "two lists diverge" risk). |
| Sync guard | `scripts/check_requirements_sync.py` | Parses `AC#` IDs out of `/REQUIREMENTS.md` and asserts the manifest covers exactly that set (no orphan, no missing). Fails CI on drift between spec and manifest. |
| CI wiring | `.github/workflows/ci.yml` | After lint/type/tests, runs the two scripts. A spec sentence with no passing proof turns the build red = the spec *governs*. |

- **Test reports consumed (deterministic, machine-readable):** pytest `--json-report` (`pytest-json-report`) → `apps/api/.report.json`; vitest `--reporter=json` → `apps/web/.vitest.json`; Playwright `--reporter=json` → `apps/web/.e2e.json`.
- **Function surface:** `acceptance_matrix.load_manifest(path)`, `collect_results(api_json, web_json, e2e_json) -> dict[node_id,bool]`, `evaluate(manifest, results) -> list[ACStatus]` (`met` = all proofs pass; `partial` = some; `missing` = none/absent), `render_markdown(rows)`, `main(argv)`.
- **Tests for the mechanism itself:** `scripts/tests/test_acceptance_matrix.py` — synthetic manifest + synthetic result dict → asserts met/partial/missing classification and `--check` exit codes; `scripts/tests/test_requirements_sync.py` — a spec fixture with a missing/extra AC id fails the guard. (These are part of AC18's proof set.)

> This section is the concrete answer to "store the final requirements in a separate top-level file that can be governed and govern": the file stays `/REQUIREMENTS.md`; governance is enforced by the manifest + two scripts + CI, not by prose alone.

## 2. Repo scaffold (dependency base for every AC)

```
apps/web/            Next.js 15 · TS · Tailwind (app router)
apps/api/            FastAPI · SQLAlchemy · Alembic (uv, py3.12)
packages/shared/     shared TS types + typed API client
infra/               docker-compose.yml (Postgres 16 + MinIO)
requirements.manifest.yaml       (§1)
scripts/             acceptance_matrix.py, check_requirements_sync.py
.github/workflows/ci.yml
pnpm-workspace.yaml · turbo.json · package.json (root) · .env.example
```

- **Root config:** `pnpm-workspace.yaml` (apps/*, packages/*), `turbo.json` (pipeline: lint, typecheck, test, build), root `package.json` scripts (`dev`, `test`, `e2e`), `.env.example` (all keys documented, **no values**: `DATABASE_URL`, `MINIO_*`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`).
- **api base:** `apps/api/pyproject.toml` (fastapi, uvicorn, sqlalchemy, psycopg, pydantic-settings, python-jose/passlib, boto3/minio, reportlab, pytest, pytest-json-report, httpx); `app/main.py` (app factory + router registration), `app/config.py` (`Settings` from env), `app/db.py` (`make_engine`/`make_sessionmaker`/`create_all`), `app/deps.py` (`get_db`, `get_current_user`, `require_role`), `app/security.py` (hash/verify + token).
  - **DIVERGENCE FROM PLAN (as built, recorded 2026-10-01 re-pass #2):** schema is materialised with **`app/db.py:create_all` (`Base.metadata.create_all`)** at app startup / in tests / in seed — **Alembic is intentionally deferred** for the PoC (no migration history needed for a reproducible single-shot stack). `alembic` is **not** a dependency. If production-style migrations are later required that is a scope decision, not a silent gap. (`apps/api/app/db.py:28-33`, `apps/api/app/main.py:21`.)
- **web base:** `apps/web/package.json` (next, react, tailwind, fabric, jspdf/pdf-lib client-side export helpers, vitest, @testing-library, playwright), `app/layout.tsx`, `lib/api.ts` (re-exports `packages/shared` client), `lib/rbac.ts`.
- **shared:** `packages/shared/src/types.ts` (Role, CatalogEntry, Composition, Post, Engagement DTOs), `src/client.ts` (fetch wrapper).
- **infra:** `infra/docker-compose.yml` services `db` (postgres:16), `minio`, `createbuckets` (one-shot mc), `api`, `web`.

## 3. Per-acceptance-item plan (files/functions/config + one test each)

Each row: the primary code it lands, the key functions/config, and the one proof test wired into `requirements.manifest.yaml`.

### AC1 — 3-role login + RBAC `[inferred, P1]`
- **api:** `app/models/user.py` (`User{email,password_hash,role,tenant_id}`), `app/routers/auth.py` (`POST /auth/login` → token; `GET /auth/me`), `app/deps.py:require_role(*roles)`, `app/security.py`.
- **web:** `app/login/page.tsx`, `lib/rbac.ts:guard(role)`, middleware `middleware.ts` redirecting by role.
- **Test:** `apps/api/tests/test_auth_rbac.py::test_role_guard_blocks_wrong_role` — agent token → `403` on an admin-only route; correct role → `200`. (Deterministic: fixed seeded users, fake passwords.)

### AC2 — Super Admin manages users/tenants + approves provider `[explicit, P3]`
- **api:** `app/models/tenant.py`, `app/routers/admin.py` (`GET/POST/PATCH /admin/users`, `/admin/tenants`, `POST /admin/providers/{id}/approve` → sets `User.approved=true`), guarded by `require_role("super_admin")`.
- **web:** `app/admin/users/page.tsx`, `app/admin/tenants/page.tsx` with an Approve action.
- **Test:** `apps/api/tests/test_admin.py::test_approve_provider_flips_flag` — unapproved provider → approve → flag true; non-admin caller → `403`.

### AC3 — Provider creates catalog entries `[explicit, P1]`
- **api:** `app/models/catalog.py` (`CatalogEntry{type∈{event,place,opportunity,offer,itinerary}, title, description, destination, market_tags[], status, brand_safe, provider_id}`), `app/routers/catalog.py:create_entry` (`POST /catalog`), `app/schemas/catalog.py` (validate `type` enum + required title).
- **web:** `app/provider/catalog/new/page.tsx` (form), list at `app/provider/catalog/page.tsx`.
- **Test:** `apps/api/tests/test_catalog_crud.py::test_create_entry_each_type` — create one of each of the 5 types; invalid type → `422`.

### AC4 — Upload image → MinIO → served `[explicit, P1]`
- **api:** `app/storage/minio_client.py` (`put_object`, `presigned_get`), `app/routers/assets.py` (`POST /catalog/{id}/image` multipart → MinIO; `GET /assets/{key}` → presigned/redirect), `app/models/catalog.py:Asset`.
- **web:** image upload control in the entry form; `<img>` from the served URL.
- **Test:** `apps/api/tests/test_assets.py::test_upload_then_fetch` — MinIO client **mocked** (in-memory fake); upload synthetic 1×1 PNG bytes → fetch returns same key/content-type. Hermetic, no live MinIO.

### AC5 — Mark brand-safe + set access `[explicit, P3]`
- **api:** `app/routers/catalog.py:set_access` (`PATCH /catalog/{id}` → `brand_safe`, `allowed_tenant_ids[]`/`allowed_agent_ids[]`), `app/models/catalog.py` access columns.
- **web:** toggle + tenant/agent multiselect on the entry edit page.
- **Test:** `apps/api/tests/test_catalog_access.py::test_set_brand_safe_and_access_scope` — set brand-safe + allow tenant A; entry reflects scope.

### AC6 — CONTRACT: agents see only approved, brand-safe entries `[requirement, P1]`
- **api:** `app/routers/catalog.py:list_for_agent` applies a **single** query filter helper `app/services/visibility.py:agent_visible_q(user)` → `status=='approved' AND brand_safe AND (tenant/agent in access scope)`. All agent-facing reads route through this helper (no ad-hoc queries).
- **Test:** `apps/api/tests/test_visibility_contract.py::test_agent_never_sees_unapproved` — seed draft + not-brand-safe + out-of-scope + one valid; agent list returns **only** the valid one; direct `GET /catalog/{draft_id}` as agent → `404`. This is the Contract-1 guard.

### AC7 — Agent browse/search/filter + compose `[explicit, P1]`
- **api:** `GET /catalog?destination=&type=&q=` (reuses `agent_visible_q`), `app/models/composition.py` (`Composition{agent_id, item_ids[], format}`), `POST /compositions`.
- **web:** `app/agent/catalog/page.tsx` (search/filter UI + "add to composition").
- **Test:** `apps/api/tests/test_catalog_search.py::test_filter_by_destination_and_type` — filters narrow results deterministically over seeded set.

### AC8 — Design Studio + format pick `[explicit, P1]`
- **web:** `app/agent/studio/page.tsx`, `components/studio/Canvas.tsx` (Fabric.js init), `components/studio/FormatPicker.tsx` (`social | story | pamphlet` → preset canvas dimensions/pages in `lib/studio/formats.ts`).
- **Test:** `apps/web/tests/formats.test.ts::test_format_presets` (vitest) — each format yields correct dimensions + page count (pamphlet multi-page).

### AC9 — Manual mode: text/shapes/bg + catalog images; multi-page `[explicit, P1]`
- **web:** `components/studio/Toolbar.tsx` (add text/shape/bg), `lib/studio/ops.ts` (`addText/addShape/setBackground/addCatalogImage/addPage` returning a serializable design doc), `components/studio/PageStrip.tsx`.
- **Test:** `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design` (vitest) — each op produces the expected JSON design node; `addPage` extends a pamphlet. Pure functions over an in-memory design model (no real canvas needed).

### AC10 — Builder (AI) mode `[explicit, P2]`
- **api:** `app/ai/builder.py:build_design(prompt, items, provider) -> DesignDoc` (LLM tool-use that emits place/write-copy ops grounded in selected catalog items), `app/routers/builder.py` (`POST /builder/design`). Uses the §AC16 abstraction; **stub provider** returns a deterministic layout when no key.
- **web:** `components/studio/BuilderPanel.tsx` (prompt → applies returned ops to the canvas; user can edit after).
- **Test:** `apps/api/tests/test_builder.py::test_builder_stub_is_deterministic` — provider forced to stub; same prompt+items → identical `DesignDoc` twice; copy references only the selected items (no external call).

### AC11 — Personalize (logo/contact/offer) `[explicit, P2]`
- **web:** `components/studio/PersonalizePanel.tsx` + `lib/studio/ops.ts:applyBranding(design,{logo,contact,offer})`; logo upload reuses the assets endpoint (agent-scoped).
- **Test:** `apps/web/tests/personalize.test.ts::test_apply_branding_adds_nodes` (vitest) — branding op injects logo/contact/offer nodes onto the active page.

### AC12 — Export PNG + PDF + email HTML `[explicit, P1]`
- **web:** `lib/studio/export.ts:toPNG(canvas)` (Fabric `toDataURL`), `components/studio/ExportMenu.tsx`.
- **api:** `app/media/pdf.py:design_to_pdf(design)` (reportlab, multi-page pamphlet), `app/media/html_export.py:design_to_email_html(design)`, `app/routers/render.py` (`POST /render/pdf`, `POST /render/email-html`).
- **Test:** `apps/api/tests/test_export.py::test_pdf_and_html_from_design` — synthetic 2-page design → PDF bytes start with `%PDF` and report 2 pages (pdf introspection); email HTML contains each text node, no secrets/keys in output.

### AC13 — Rudimentary video MP4 (demo-video mechanism) `[explicit, P2]`
- **api:** `app/media/video.py` (`build_scene_script(items) -> Scenes`, `render_video(scenes, images) -> mp4_path` via ffmpeg zoompan + `drawtext` overlays + optional `say`/espeak TTS + captions), `app/routers/render.py:render_video` (`POST /render/video`). Builder auto-scripts via `builder.build_scene_script`; agent edits scenes then re-renders.
- **web:** `components/studio/VideoPanel.tsx` (scene list editor + render/preview).
- **Test:** `apps/api/tests/test_video.py::test_scene_script_deterministic_and_cmd_shape` — `build_scene_script` is deterministic over seeded items; ffmpeg invocation is **mocked** (assert the drawtext/zoompan command shape + output path), TTS mocked — no real encode in unit tests. One opt-in slow integration test guarded by an env marker renders a tiny real clip (skipped in CI default).

### AC14 — Social schedule/publish (simulated) `[explicit, P3]`
- **api:** `app/models/post.py` (`Post{composition_id, channel, status∈{scheduled,published}, scheduled_at, published_at}`), `app/routers/social.py` (`POST /social/schedule`, `POST /social/publish`) — simulated connector `app/services/social_sim.py` (no real OAuth/egress).
- **web:** `app/agent/social/page.tsx` (schedule/publish a composition).
- **Test:** `apps/api/tests/test_social.py::test_schedule_then_publish_transitions` — schedule → status `scheduled`; publish → `published` + timestamp; clock injected for determinism.

### AC15 — Engagement dashboard (seeded) `[inferred, P3]`
- **api:** `app/models/engagement.py` (`Engagement{post_id, impressions, clicks, engagement}`), `GET /engagement` returns per-post seeded metrics; seeded in `app/seed.py`.
- **web:** `app/agent/engagement/page.tsx` (table/cards of impressions/clicks/engagement).
- **Test:** `apps/api/tests/test_engagement.py::test_dashboard_returns_seeded_metrics` — published post → endpoint returns its seeded metric row.

### AC16 — AI provider abstraction (3 providers, env keys, stub, mocked) `[explicit, P1]`
- **api:** `app/ai/base.py:AIProvider` (ABC: `complete(prompt, tools) -> Response`), `app/ai/claude.py` / `openai.py` / `gemini.py` (real clients, keys from `Settings`, default model `claude-sonnet-5-5`), `app/ai/stub.py` (deterministic), `app/ai/factory.py:get_provider(settings)` (selects by `AI_PROVIDER`; **falls back to stub when the matching key is absent**).
- **Test:** `apps/api/tests/test_ai_provider.py::test_factory_selects_and_falls_back` — `AI_PROVIDER=openai` + no key → stub; with a **fake** key → openai client (HTTP mocked); stub output deterministic. No real network, no real key.

### AC17 — `docker compose up` + seed script `[explicit, P1]`
- **infra:** `infra/docker-compose.yml` (db, minio, createbuckets, api, web) + healthchecks; `app/seed.py:seed()` loads 3 users (one per role) + synthetic catalog (each type) + a composition; idempotent (upsert by stable ids). Schema is created via `db.create_all` before seeding (no Alembic step — see §2 divergence). **As built:** compose + Dockerfile + `.env.example` landed; the published-post/engagement rows wait on AC14/AC15 (P3, not yet built). Compose is not runtime-verified in this env.
- **config:** root `README`/`AGENTS` dev commands; `make`/pnpm scripts `dev`, `seed`.
- **Test:** `apps/api/tests/test_seed.py::test_seed_is_idempotent_and_complete` — run `seed()` twice on a test DB (sqlite/synthetic) → same counts, one user per role, ≥1 approved brand-safe entry.

### AC18 — Tests pass + acceptance matrix green `[inferred, P1]`
- **Covers the whole suite** (pytest + vitest + Playwright) **plus** the §1 governance mechanism.
- **web e2e:** `apps/web/e2e/studio-smoke.spec.ts` — login as agent → browse catalog → open studio → pick format → add a catalog image + text → export PNG → schedule post. Playwright, deterministic against the seeded stack (stub AI).
- **Test(s):** the e2e smoke above; `scripts/tests/test_acceptance_matrix.py`; `scripts/tests/test_requirements_sync.py`. AC18 is `met` only when every other AC's proofs pass **and** `acceptance_matrix.py --check` exits 0.

## 4. Dependency graph (build order edges)

```
scaffold (§2) ─┬─> AC16 (AI abstraction) ─> AC10 (Builder) ─> AC13 (video auto-script)
               ├─> AC1 (auth/RBAC) ──> AC2 (admin) 
               │                   └─> AC6 (visibility contract) ──> AC7 (browse/compose)
               ├─> AC3 (catalog CRUD) ─┬─> AC4 (image/MinIO)
               │                       ├─> AC5 (brand-safe/access) ─> AC6
               │                       └─> AC7
               ├─> AC8 (studio+format) ─> AC9 (manual) ─┬─> AC11 (personalize)
               │                                        ├─> AC10 (builder applies ops)
               │                                        ├─> AC12 (export PNG/PDF/HTML)
               │                                        └─> AC13 (video)
               ├─> AC7 ─> AC14 (schedule/publish) ─> AC15 (engagement)
               └─> AC17 (compose+seed) ──> AC18 (full suite + matrix)
governance (§1) depends on: all AC tests existing ──> folded into AC18
```

Critical path: `scaffold → AC1/AC3 → AC6 → AC7 → AC8 → AC9 → AC12 → AC17 → AC18`.

## 5. Build phasing (mapped to the loop's iterations)

- **Inner iteration 1 — P1 core:** scaffold, AC1, AC3, AC4, AC6, AC7, AC8, AC9, AC12, AC16, AC17, then stand up AC18 harness + §1 manifest/scripts.
- **Inner iteration 2 — P2 AI-wow:** AC10, AC11, AC13 (+ their manifest rows).
- **Outer iteration (if gaps) — P3 surrounding:** AC2, AC5, AC14, AC15; re-run acceptance matrix to green.

Each AC lands with its proof test and a manifest row in the same change, so the matrix moves `missing → met` incrementally and the ledger matrix is regenerated (never hand-edited).

## 6. Determinism, secrets, fixtures (rule compliance)

- **Secrets:** all keys from env (`app/config.py`); `.env.example` has names only; no key is logged (log provider *name*, never value) or shown in exports (asserted in AC12/AC16 tests). Satisfies `security.md` + Contract 2.
- **Determinism:** AI forced to stub in tests; clock + randomness injected (`deps.get_clock`); ffmpeg/TTS/MinIO/network all mocked in unit tests; one seeded dataset drives search/engagement/e2e. Satisfies `testing.md` + Contract 4.
- **Synthetic fixtures:** `apps/api/tests/conftest.py` builds users with fake passwords (`test-pass-xxxx`), 1×1 PNG byte blobs, seeded catalog; no real records/keys.
- **Traceability (Contract 3):** `app/models/audit.py:AuditLog` + `app/audit.py:record(action,actor,target)` written on delete/unpublish/overwrite; `apps/api/tests/test_audit.py::test_destructive_actions_are_logged`.

### 6a. System contracts → enforcing proofs (governance map)

The spec's four non-functional contracts (`/REQUIREMENTS.md` §4) each map to a concrete, named proof so none is prose-only:

| Contract | Enforced by | Proof (node-id) |
| --- | --- | --- |
| **C1** — only approved brand-safe content reaches agents | `app/services/visibility.py:agent_visible_q` (single choke-point) | `test_visibility_contract.py::test_agent_never_sees_unapproved` (= AC6) |
| **C2** — no secrets/PII leave the boundary (keys from env) | `app/config.py` env-only; provider logs name not value; exports scrubbed | `test_ai_provider.py::test_factory_selects_and_falls_back` (AC16) + `test_export.py::test_pdf_and_html_from_design` asserts no key in output (AC12) |
| **C3** — destructive actions are traceable | `app/audit.py:record` on delete/unpublish/overwrite | `test_audit.py::test_destructive_actions_are_logged` |
| **C4** — runs reproducible; AI deterministic in tests | stub-forced AI + injected clock/seed + mocked boundaries | `test_builder.py::test_builder_stub_is_deterministic` (AC10) + `test_seed.py::test_seed_is_idempotent_and_complete` (AC17) |

> **Governance observation (no scope change).** C1/C2/C4 are each pinned to an AC in `/requirements.manifest.yaml`, so the acceptance matrix reds the build if they regress. **C3's proof (`test_audit.py`) is not wired to any AC** — the 18-item acceptance contract has no dedicated audit item, so C3 is tested but not governed by the matrix. Options for the user (any is a spec edit → version bump + change-log row + approval, per `/REQUIREMENTS.md` §Governance): (a) add `AC19 — destructive actions are audit-logged [requirement]` and map `test_audit.py` to it; (b) extend AC6's manifest `api:` list with the audit proof; or (c) accept C3 as a tested-but-unmatrixed contract. Recommended: **(a)** — it keeps one-contract-one-AC symmetry and makes the matrix the single source of enforcement. Deferred to the user; this PLAN pass makes no scope change (spec stays v1.0.0).

## 7. Risks & mitigations

- **Fabric.js in vitest (no DOM canvas).** → Studio logic lives in pure `lib/studio/ops.ts` over a serializable design model; canvas rendering covered only by the Playwright smoke. Cited: jsdom lacks canvas — *jsdom "Not implemented: HTMLCanvasElement" — github.com/jsdom/jsdom (accessed 2026-10-01)*.
- **Real ffmpeg encode is slow/non-hermetic in CI.** → unit tests assert command shape with ffmpeg mocked; real encode behind an opt-in marker.
- **Manifest vs spec drift (Approach D's named risk).** → `check_requirements_sync.py` fails CI on any AC mismatch; the ledger matrix is generated, never hand-edited.
- **Provider SDK/network flakiness.** → real-provider paths unit-tested with HTTP mocked; stub fallback guarantees a runnable demo with no keys.

## 8. Not doing (scope guard)

Per `/REQUIREMENTS.md` §6: real social OAuth, billing, white-label theming, full video editing, production auth hardening, real email delivery, CRM/newsletter integrations, the commercial model. No scope change to AC1–AC18 → **no version bump** of `/REQUIREMENTS.md` triggered by this plan.

---

## 9. P1-UI phase build plan — "Verifiable UI slice" (RE-ENTRY B, MANAGER re-pass 2026-10-01)

**Scope of this section:** the 13 acceptance items in phase **P1-UI** only — **AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC12, AC16, AC17, AC18**. P2 (AC10/11/13) and P3 (AC14/15) are explicitly *out of scope this phase* (deferred to a later run). This section is the concrete HOW for the already-chosen re-entry approach (ledger → "Chosen re-entry approach: Approach 2 — risk-first vertical slice"): it does not re-pick the approach, it specifies exact files/functions/config, the dependency graph, and one proof test per item.

**As-built starting point (verified on disk this pass):** the FastAPI `apps/api` already satisfies AC1,2,3,4,5,6,7,12,16,17 server-side (17 pytest PASS) and `apps/web/lib/studio/{formats,ops}.ts` already satisfy AC8/AC9 logic (2 vitest PASS). **What P1-UI adds is the missing web UI + three defect fixes.** No new API feature is required for P1-UI; the only API change is the Gate-1 security fix. Environment confirmed this pass: `node v26.6.0`, `pnpm`, `npx`, `playwright`, `docker` all present.

### 9.1 The three carried-over defects (must land before "verifiable")

| # | Defect | Exact location | Fix |
| --- | --- | --- | --- |
| D1 | **Unauthenticated asset egress** (P1 security; Contracts 1+2) | `apps/api/app/routers/assets.py:42` `fetch_asset` has no `Depends` auth and no visibility check | Gate 1 below |
| D2 | **Docker can't boot** — compose uses `postgresql+psycopg://` (`infra/docker-compose.yml:59`) but `psycopg` is absent from `apps/api/pyproject.toml` deps | `apps/api/pyproject.toml` dependencies | Gate 2 below |
| D3 | **No Playwright e2e** — AC18 e2e node-id in the manifest points at a file that does not exist | `apps/web/e2e/studio-smoke.spec.ts` (missing) | Gate 5 below |

### 9.2 Gates (each = one commit + one green gate; order from the chosen approach)

#### Gate 1 — asset-auth fix + shared visibility predicate  → proves **AC4, AC6** (Contracts 1+2)
- **`apps/api/app/services/visibility.py`** — add one new choke-point function reused by the asset route so asset-access and catalog-access rules can never drift:
  - `visible_asset_or_none(db, user, object_key) -> Asset | None` — (a) **reject path traversal first**: if `object_key` contains `..`, a leading `/`, or a backslash → return `None` (never touch storage); (b) look up `Asset` by `object_key`; (c) load its `CatalogEntry`; (d) role logic reusing the *existing* predicate: `content_provider` → own entry only (`entry.provider_id == user.id`); `tourism_agent` → `is_visible_to_agent(entry, user)` (the same function catalog reads use); `super_admin` → allowed. Return the `Asset` or `None`.
- **`apps/api/app/routers/assets.py`** — rewrite `fetch_asset`:
  - add `current: User = Depends(get_current_user)` (any authenticated user; `401` when the token is missing/invalid — already handled by `get_current_user`).
  - `asset = visible_asset_or_none(db, current, object_key)`; if `None` → `raise HTTPException(404, "Asset not found")` — **404 not 403** so a hidden/unknown key is indistinguishable from missing (can't be probed).
  - only then `storage.get_object(asset.object_key)`.
  - inject `db: Session = Depends(get_db)` (currently absent).
- **Test (AC4 proof, same node-id):** `apps/api/tests/test_assets.py::test_upload_then_fetch` — **update**: provider uploads → provider fetches own asset with `provider_headers` → `200` + bytes match. **Add (strengthen AC6/Contract 1, no manifest row needed):** `test_asset_requires_auth` (no header → `401`), `test_agent_cannot_fetch_hidden_asset` (asset on a draft/unsafe entry, agent → `404`), `test_asset_path_traversal_rejected` (`GET /assets/..%2f..%2fetc%2fpasswd` → `404`), `test_agent_fetches_visible_asset` (entry approved+brand-safe → agent `200`).
- **Web side consumed later:** `apps/web/lib/api.ts:fetchAssetObjectUrl(objectKey)` — authed `fetch` with the bearer token → `blob()` → `URL.createObjectURL` (the locked-in "authed-fetch → blob URL" decision; no API change, no cookie-proxy).

#### Gate 2 — docker driver + compose validation  → proves **AC17**
- **`apps/api/pyproject.toml`** — add `"psycopg[binary]>=3.2"` to `[project].dependencies`; run `uv lock` to refresh `apps/api/uv.lock`.
- **Validation (no runtime DB needed, hermetic):** `docker compose -f infra/docker-compose.yml config -q` must exit 0 — added to `make verify` (Gate 6) and already runnable in CI.
- **Test (AC17 proof, unchanged):** `apps/api/tests/test_seed.py::test_seed_is_idempotent_and_complete` (already green). The driver fix is verified by `uv sync` resolving + `compose config` passing, recorded in the gate's commit; full `docker compose up` stays "not runtime-verified in this env" (honest caveat kept).

#### Gate 3 — Fabric-in-Next studio spike (retire the hardest unknown while budget is intact)
- **`apps/web/` scaffold (prerequisite for Gates 3–5):**
  - `apps/web/package.json` — add deps `next@^15`, `react@^19`, `react-dom@^19`, `fabric@^6`, `tailwindcss`, `postcss`, `autoprefixer`, `@playwright/test`; scripts `dev` (`next dev`), `build` (`next build`), `start` (`next start`), `lint` (`next lint`), `typecheck` (`tsc --noEmit`), `e2e` (`playwright test`). Keep existing `vitest`/`typecheck`.
  - `apps/web/next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`.
  - `apps/web/tsconfig.json` — extend `include` to `app`, `components`, `lib`, `tests`; add Next types.
- **`apps/web/components/studio/StudioCanvas.tsx`** — the spike: a client component (`"use client"`) that mounts Fabric.js on a `<canvas>` and renders a `DesignDoc` (from `lib/studio/ops.ts`) → Fabric objects, and maps Fabric mutations back through the **pure `lib/studio` ops** (which stay the single source of truth — the canvas is a view, never the model).
- **`apps/web/app/agent/studio/page.tsx`** — imports `StudioCanvas` via `dynamic(() => import(...), { ssr: false })` (Fabric needs `window`; this kills the SSR canvas crash — the documented risk).
- **Gate = `next build` succeeds** (no SSR/`window` crash) and the canvas renders a seeded design. No new proof test here; AC8/AC9 keep their vitest proofs, canvas rendering rides the Gate-5 e2e.

#### Gate 4 — app shell + typed client + role guards, then the four screens  → proves **AC1, AC2, AC3, AC5, AC7, AC12** (+ AC8/AC9 wiring)
- **Shell + client + auth (built first; prerequisite for every screen):**
  - `apps/web/lib/api.ts` — typed client over the FastAPI surface: `login(email,password)`, `me()`, `listAgentCatalog({destination,type,q})`, `getEntry(id)`, `createEntry(body)`, `setAccess(id,body)`, `uploadImage(id,file)`, `listUsers()`, `approveProvider(id)`, `renderPdf(design)`, `renderEmailHtml(design)`, `fetchAssetObjectUrl(key)`. Bearer token from `lib/session.ts`. **Never logs the token or any key** (Contract 2).
  - `apps/web/lib/session.ts` — token + role in `localStorage` (try/catch guarded), `getRole()`, `clear()`.
  - `apps/web/lib/rbac.ts` — `ROUTE_ROLES` map (`/admin*`→super_admin, `/provider*`→content_provider, `/agent*`→tourism_agent) + `allowed(path, role)`.
  - `apps/web/middleware.ts` — redirect to `/login` when no session; redirect to the role's home when a role hits another role's route (the negative-redirect behaviour the Gate-5 test asserts).
  - `apps/web/app/layout.tsx`, `apps/web/app/page.tsx` (→ `/login`), `apps/web/app/login/page.tsx` (**AC1** UI).
  - Proportionate **loading / empty / error** states per screen (one spinner, one empty line, one error line — not a full failure matrix; budget-proportionate per the chosen approach).
- **The four screens are on DISJOINT files → parallelisable across workers (see 9.3):**
  - **Agent (AC6/AC7):** `apps/web/app/agent/catalog/page.tsx` — browse + search box + destination/type filters (calls `listAgentCatalog`) + "add to composition"; thumbnails via `fetchAssetObjectUrl`.
  - **Agent studio (AC8/AC9/AC12):** `apps/web/app/agent/studio/page.tsx` + `components/studio/{FormatPicker,Toolbar,ExportMenu}.tsx`. `FormatPicker` → `lib/studio/formats.ts`; `Toolbar` → `lib/studio/ops.ts`; `ExportMenu`: **PNG** via Fabric `canvas.toDataURL` (+ `lib/studio/export.ts:filenameFor(format)` pure helper), **PDF**/**email-HTML** via `renderPdf`/`renderEmailHtml`.
  - **Provider (AC3/AC4/AC5):** `apps/web/app/provider/catalog/page.tsx` (list), `.../new/page.tsx` (create form **AC3** + image upload **AC4**), `.../[id]/page.tsx` (brand-safe toggle + tenant/agent access scope **AC5**).
  - **Super-Admin (AC2):** `apps/web/app/admin/page.tsx` — user list + "Approve provider" action.
- **Tests (proofs unchanged — these screens are wired to already-proven API/logic; the UI itself is proven by the Gate-5 e2e):** AC1 `test_auth_rbac.py::test_role_guard_blocks_wrong_role`; AC2 `test_admin.py::test_approve_provider_flips_flag`; AC3 `test_catalog_crud.py::test_create_entry_each_type`; AC5 `test_catalog_access.py::test_set_brand_safe_and_access_scope`; AC7 `test_catalog_search.py::test_filter_by_destination_and_type`; AC8 `formats.test.ts::test_format_presets`; AC9 `studio-ops.test.ts::test_manual_ops_mutate_design`; AC12 `test_export.py::test_pdf_and_html_from_design` (+ PNG exercised in the e2e).

#### Gate 5 — Playwright smoke + negative redirect  → proves **AC18**
- **`apps/web/playwright.config.ts`** — `webServer` runs the **production build** (`next build && next start`) + the API (`uvicorn app.main:create_app --factory`) + `seed`, against stub AI (no keys) and seeded users → deterministic (the locked decision; kills `next dev` cold-compile flake). Single chromium project, `reporter: json`.
- **`apps/web/e2e/studio-smoke.spec.ts`** — `test('studio smoke', …)` (title **must** be exactly `studio smoke` so the parsed node-id is `apps/web/e2e/studio-smoke.spec.ts::studio smoke`, matching the manifest): login as `agent@example.test` → browse catalog → open studio → pick a format → add a catalog image + a text node → **export PNG** (assert the download) and **export PDF** (assert `%PDF`).
- **`apps/web/e2e/rbac-smoke.spec.ts`** — `test('agent is redirected away from admin', …)`: logged-in agent navigates to `/admin` → lands on the agent home, not the admin page (the grafted negative e2e).
- **Tests (AC18 proofs — the 3 manifest node-ids):** `scripts/tests/test_acceptance_matrix.py::test_evaluate_classifies_met_partial_missing`, `scripts/tests/test_requirements_sync.py::test_sync_detects_missing_and_extra` (both already green), **+ the now-real** `apps/web/e2e/studio-smoke.spec.ts::studio smoke`.

#### Gate 6 — `make verify` aggregate + README runbook
- **`Makefile`** `verify` target, in order: `ruff check` → api `pytest … --json-report` → web `tsc --noEmit` → `vitest run --reporter=json` → `playwright test --reporter=json` → `python scripts/acceptance_matrix.py --api-report … --web-report … --e2e-report … --write-ledger --check` → `python scripts/check_requirements_sync.py` → `docker compose -f infra/docker-compose.yml config -q`.
- **`README.md`** runbook: `docker compose up`, seed command, dev commands, test + e2e commands, and the "no key → deterministic stub AI" note.
- **No new AC** — this gate makes AC18 enforceable end-to-end and regenerates the ledger matrix (never hand-edited).

### 9.3 Dependency graph + parallelisation (disjoint files)

```
          ┌─ Gate 1  apps/api/app/{services/visibility.py, routers/assets.py} + tests  ─┐
 start ───┤                                                                              ├─► Gate 5 (e2e)
          └─ Gate 2  apps/api/pyproject.toml + infra/docker-compose.yml (config only)  ─┘        │
                                                                                                 ▼
 web-scaffold (apps/web/package.json, next/tailwind/tsconfig)  ─► Gate 3 (StudioCanvas spike) ──► Gate 6
                                                              └─► Gate 4 shell+client+auth (AC1) ─┤
                                                                      │                           │
                                      ┌───────────────┬──────────────┼───────────────┐           │
                                      ▼               ▼              ▼                ▼           │
                                 Agent AC6/7     Provider AC3/4/5  Admin AC2    Studio AC8/9/12 ──┘
                                 (app/agent/*)   (app/provider/*)  (app/admin/*) (app/agent/studio/*
                                                                                  + components/studio/*)
```

**What runs in PARALLEL on disjoint files:**
1. **Gate 1 ∥ Gate 2** — Gate 1 edits `app/services/visibility.py` + `app/routers/assets.py`; Gate 2 edits `pyproject.toml` + `docker-compose.yml`. No shared file → two workers in parallel.
2. **Gate 3 ∥ Gate 4-shell** — once the web scaffold lands, the `StudioCanvas` spike (`components/studio/StudioCanvas.tsx`) and the app shell/client/auth (`lib/api.ts`, `lib/session.ts`, `middleware.ts`, `app/login/*`) touch disjoint files → parallel.
3. **The four screens** — after Gate-4 shell + typed client exist, Agent (`app/agent/catalog/*`), Provider (`app/provider/*`), Admin (`app/admin/*`), and Studio (`app/agent/studio/*` + `components/studio/*`) are on disjoint route/component folders → **four parallel workers**, all consuming the one shared `lib/api.ts` (read-only to them) and the shared `lib/studio` (studio worker only).

**Serial edges (cannot parallelise):** web-scaffold → everything web; Gate-4 shell → the four screens (they import `lib/api.ts`); all screens + Gate 1 + Gate 2 → Gate 5 e2e (it drives the whole stack); Gate 5 → Gate 6 (`make verify` consumes the e2e report). **Critical path:** `scaffold → Gate 4 shell → (slowest screen) → Gate 5 e2e → Gate 6`.

### 9.4 One test per acceptance item (P1-UI)

| AC | Proof node-id (wired in `requirements.manifest.yaml`) | Change this phase |
| --- | --- | --- |
| AC1 | `apps/api/tests/test_auth_rbac.py::test_role_guard_blocks_wrong_role` | keep green; login UI exercised by Gate-5 e2e |
| AC2 | `apps/api/tests/test_admin.py::test_approve_provider_flips_flag` | keep green; admin screen wired |
| AC3 | `apps/api/tests/test_catalog_crud.py::test_create_entry_each_type` | keep green; provider create form wired |
| AC4 | `apps/api/tests/test_assets.py::test_upload_then_fetch` | **updated** for auth (Gate 1) |
| AC5 | `apps/api/tests/test_catalog_access.py::test_set_brand_safe_and_access_scope` | keep green; provider access UI wired |
| AC6 | `apps/api/tests/test_visibility_contract.py::test_agent_never_sees_unapproved` | keep green; **strengthened** — asset route now reuses the same predicate (Gate 1) |
| AC7 | `apps/api/tests/test_catalog_search.py::test_filter_by_destination_and_type` | keep green; agent browse UI wired |
| AC8 | `apps/web/tests/formats.test.ts::test_format_presets` | keep green; FormatPicker wired |
| AC9 | `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design` | keep green; Toolbar/canvas wired |
| AC12 | `apps/api/tests/test_export.py::test_pdf_and_html_from_design` | keep green; **PNG** added client-side, exercised in Gate-5 e2e |
| AC16 | `apps/api/tests/test_ai_provider.py::test_factory_selects_and_falls_back` | keep green; **no UI work** (Builder is deferred P2) — stub fallback stays the P1-UI runtime default |
| AC17 | `apps/api/tests/test_seed.py::test_seed_is_idempotent_and_complete` | keep green; **+ `docker compose config -q`** (Gate 2) |
| AC18 | `scripts/tests/test_acceptance_matrix.py::test_evaluate_classifies_met_partial_missing` · `scripts/tests/test_requirements_sync.py::test_sync_detects_missing_and_extra` · `apps/web/e2e/studio-smoke.spec.ts::studio smoke` | **e2e now built** (Gate 5) → AC18 moves `missing (0/3) → met (3/3)` |

### 9.5 Determinism / secrets / fixtures (phase-specific)
- **Determinism:** e2e runs against `next build && next start` + seeded DB + **stub AI** (no keys) + fixed seed users; Fabric node-ids stay derived from `lib/studio` (no `Math.random`/`Date.now`); Playwright single chromium project. (Contract 4 / `testing.md`.)
- **Secrets:** `lib/api.ts` logs neither the bearer token nor any provider key; `.env.example` stays names-only; asset bytes are synthetic 1×1 PNGs. (Contract 2 / `security.md`.)
- **No manifest/spec change:** the manifest already lists exactly these node-ids (incl. the e2e), so `check_requirements_sync` stays green and **`/REQUIREMENTS.md` stays v1.0.0 — no version bump** (this phase builds the UI + fixes defects; it changes no acceptance scope).

### 9.6 Out of scope this phase (guard)
AC10 (Builder AI), AC11 (personalize), AC13 (video) — **P2, deferred**. AC14 (social), AC15 (dashboard) — **P3, deferred**. No social/engagement UI, no Builder panel, no video panel is built in P1-UI; the studio ships manual-mode + export only.
