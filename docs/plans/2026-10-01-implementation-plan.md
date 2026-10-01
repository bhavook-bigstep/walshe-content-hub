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

## 10. REWORK plan — two design-change findings (MANAGER re-pass, RE-ENTRY, 2026-10-01)

**Why this section exists.** Review raised two design-change findings that are *contract-vs-code conflicts* under CLAUDE.md's rule ("treat a conflict between code and /REQUIREMENTS.md as a bug in the code"), so they cannot be closed by a quiet local edit — each needs either a conforming restructure or a governed spec amendment. This section is the concrete REWORK: exact files/functions/config, the dependency graph (what parallelises on disjoint files), and a proof test per change. It sits **ahead of** §9 Gates 1–6 (all of which have already landed; P1-UI = 13/13 met per the ledger). The P1-UI acceptance items (**AC1,2,3,4,5,6,7,8,9,12,16,17,18**) are **re-covered** in §10.4 — the REWORK must keep every one of them green.

### 10.1 Finding F1 — module/library boundary divergence from the governed architecture

**The conflict (verified on disk this pass).** CLAUDE.md Architecture (line 32–39) and `REQUIREMENTS.md` §5 govern a *"Monorepo (pnpm + turborepo + uv)"* with **`packages/shared` holding shared TS types + the API client**. None of that infrastructure exists: no `turbo.json`, no `pnpm-workspace.yaml`, no root `package.json`, no `packages/` directory (confirmed: all absent). The API client and every request/response type live in **`apps/web/lib/api.ts`** and are **hand-duplicated** from the Python Pydantic schemas — `Entry`/`EntryCreate`/`AccessUpdate` (`apps/web/lib/api.ts:17–40`) mirror `apps/api/app/schemas/catalog.py:8–34` (`EntryCreate`/`AccessUpdate`/`EntryOut`) with **no compile-time link**, so the two can silently drift (e.g. a new Pydantic field, a type change, or a renamed enum value never reaches the TS side and no build fails).

**Chosen REWORK — Primary: conform the code to the spec (no amendment, no approval needed).** Make the repo match §5 verbatim *and* eliminate the real bug (silent drift) by making the Python side the single source of truth and **generating** the TS contract from it with a drift guard. This is the first option the finding names ("restructuring into the governed turborepo + `packages/shared`") and it needs no scope change, so `/REQUIREMENTS.md` stays **v1.0.0**.

- **Root workspace scaffold (new files):**
  - `pnpm-workspace.yaml` — `packages: ["apps/*", "packages/*"]`.
  - `package.json` (root, private) — `packageManager: pnpm@9`; devDeps `turbo@^2`, `openapi-typescript@^7`, `typescript@^5`; scripts `build`/`test`/`lint`/`typecheck` → `turbo run …`, `gen:api-types` → `node scripts/gen-api-types.mjs`.
  - `turbo.json` — pipeline `build` (`dependsOn: ["^build"]`, outputs `.next/**` for web), `test`, `lint`, `typecheck`. (turborepo is justified, not gold-plating: this repo is 3 JS/TS packages — `apps/web` + `packages/shared` + root — squarely in turbo's 2–10-package sweet spot; see citations.)
- **`packages/shared` — the single home of the web↔api contract (new):**
  - `packages/shared/package.json` — name `@walsh/shared`, exports `./types` + `./client`; scripts `typecheck`, `gen`.
  - `packages/shared/tsconfig.json` (strict).
  - `packages/shared/openapi.json` — **committed deterministic snapshot** of the FastAPI OpenAPI schema (produced by `scripts/dump_openapi.py`; source of truth = the Pydantic models, so this is downstream of `apps/api/app/schemas/*`).
  - `packages/shared/src/api-types.ts` — **generated** (`openapi-typescript packages/shared/openapi.json -o …`); never hand-edited. Friendly aliases re-exported: `export type Entry = components["schemas"]["EntryOut"]`, `EntryCreate = components["schemas"]["EntryCreate"]`, `AccessUpdate = components["schemas"]["AccessUpdate"]`, plus `User`.
  - `packages/shared/src/client.ts` — the typed API client **moved from** `apps/web/lib/api.ts`, now importing its types from `./api-types` (fulfils "`packages/shared` holding shared TS types **+ the API client**"). Contract-2 invariant preserved: never logs the bearer token or any provider key.
  - `packages/shared/src/index.ts` — re-exports `./client` + `./types`.
- **Generator + drift guard (the compile-time link the finding says is missing):**
  - `scripts/dump_openapi.py` — imports `app.main:create_app`, writes `app.openapi()` with `sort_keys=True` to a path (hermetic, no network, deterministic).
  - `scripts/gen-api-types.mjs` — runs `dump_openapi.py` → `openapi.json`, then `openapi-typescript` → `src/api-types.ts`.
  - `scripts/check_api_types_sync.py` — regenerate both artefacts into a temp dir and compare byte-for-byte against the committed `packages/shared/openapi.json` + `src/api-types.ts`; **non-empty diff → non-zero exit** (fails the build). This is what makes Pydantic↔TS unable to silently drift.
  - **Wiring:** add a `api-types-sync` target to the `Makefile` (invoked inside `verify`, before `web-typecheck`) and a `contract-sync` step to the `.github/workflows/ci.yml` `web` job.
- **Consumer shim (minimal churn):** `apps/web/package.json` adds `"@walsh/shared": "workspace:*"`; **`apps/web/lib/api.ts` becomes a thin re-export** of `@walsh/shared` (`export * from "@walsh/shared"`) so existing screen imports (`@/lib/api`) keep resolving — no per-screen edits, and the one-and-only definition now lives in `packages/shared`, generated.

**Fallback (cheaper; the second option the finding names — user may elect it at ⏸ verify gate).** A **governed amendment**: bump `/REQUIREMENTS.md` **1.0.0 → 1.1.0** (minor = soften an infra requirement) + CLAUDE.md Architecture, right-sizing §5 to the as-built two-app PoC layout (pnpm + uv retained; **turborepo + a separate `packages/shared` workspace deferred post-PoC — YAGNI for a 2-app repo**) and declaring that the web↔api contract is instead guaranteed by the **generated-types drift guard inside `apps/web`**. Add a Change-log row; stage the diff and **route it to the human verify gate — never self-approve**. This keeps the drift guard (the real fix) and drops only the workspace scaffolding.

**Manager recommendation:** take the **Primary** (restructure) — it closes the conflict with no pending approval and is strictly governance-safe; run it **risk-first as Gate R1** (before any further UI work) because converting `apps/web` into a workspace member touches the lockfile and could regress the already-green web suites, so its green gate (below) is the checkpoint. If the user prefers to minimise structural churn, the Fallback amendment is pre-written and ready to approve at the gate.

- **Gate R1 green checkpoint:** `pnpm -w install` resolves; `turbo run typecheck` → 0 errors; `pnpm --filter web exec vitest run` → **AC8/AC9 still pass**; `playwright test` → **AC18 studio-smoke still passes**; `python scripts/check_api_types_sync.py` → **PASS (no drift)**; and a **deliberate-drift unit test** proves the guard bites.
- **Proof test (new; governance/contract, not an AC — like the audit test, so no manifest row and `check_requirements_sync` stays green):** `scripts/tests/test_api_types_sync.py::test_detects_pydantic_drift` — feed a doctored `openapi.json` (one field removed) to the checker and assert it exits non-zero; feed the real snapshot and assert it exits zero. (testing.md: new logic ships with a test, synthetic fixtures, deterministic.)

### 10.2 Finding F2 — Contract 3 unimplemented + untested for `set_access` (unpublish / overwrite)

**The conflict (verified on disk).** Contract 3 (CLAUDE.md line 66, `REQUIREMENTS.md` §4.3) covers **delete / unpublish / overwrite**, but the only audit test (`apps/api/tests/test_audit.py::test_destructive_actions_are_logged`) asserts the **`delete`** path only. `PATCH /catalog/{id}` → `set_access` (`apps/api/app/routers/catalog.py:44–64`) can **unpublish** (`status` approved→draft, lines 56–57) and **overwrite** access scope / `brand_safe` (lines 54–61), yet it writes **no audit row** and no test asserts one. The traceability contract is both **unimplemented for mutation and untested** — a test alone would just expose the gap, so the fix is to add `audit.record(...)` to `set_access`, then assert it.

**Chosen REWORK (code + test; no scope change — a system-contract fix, not an AC edit).**
- **`apps/api/app/routers/catalog.py`:**
  - Extend the import to `from app.models.catalog import CatalogEntry, CatalogType, EntryStatus`.
  - In `set_access`, **before** mutating, capture `was_approved = entry.status == EntryStatus.approved`.
  - After applying the fields, record the traceable actions (caller already commits; `audit.record` flushes):
    - **unpublish** — `if body.status is not None and was_approved and body.status != EntryStatus.approved:` → `audit.record(db, actor_id=provider.id, action="unpublish", target_type="catalog_entry", target_id=entry_id)`.
    - **overwrite** — `if body.brand_safe is not None or body.allowed_tenant_ids is not None or body.allowed_agent_ids is not None:` → `audit.record(db, …, action="overwrite", …)`.
  - Then the existing `db.commit()` / `db.refresh(entry)` / `return entry` — response shape (`EntryOut`) unchanged, so **AC5's test stays green** and the web Provider access UI is unaffected.
- **Proof test (new; Contract 3, unmatrixed — no manifest row):** add to `apps/api/tests/test_audit.py` → `test_set_access_unpublish_and_overwrite_are_logged`: create an entry; PATCH approved+brand_safe+`allowed_tenant_ids=[1]` → assert one `AuditLog` row `action="overwrite", target_id=entry_id, actor_id>0`; PATCH `status="draft"` → assert an `action="unpublish"` row; PATCH `allowed_tenant_ids=[999]` → assert a second `overwrite` row. Synthetic data, deterministic (testing.md).
- **Governance note (unchanged, deferred to user):** Contract 3 still has **no dedicated AC** (ledger "— (C3)"). This REWORK *implements + tests* the contract; it does **not** invent an AC. The standing open decision — add `AC19`, fold the audit proof into AC6, or accept C3 as tested-but-unmatrixed — remains the user's and is a spec edit (version bump + change-log + approval), so **no scope change is made here**; `/REQUIREMENTS.md` stays v1.0.0.

### 10.3 Dependency graph + parallelisation (REWORK, disjoint files)

```
 R1  F1 restructure  ── root {pnpm-workspace.yaml, package.json, turbo.json}
     (risk-first)        + packages/shared/**  + scripts/{dump_openapi.py, gen-api-types.mjs, check_api_types_sync.py}
                         + apps/web/lib/api.ts (→ re-export)  + apps/web/package.json
                         + scripts/tests/test_api_types_sync.py
         │  (shared edits: Makefile + .github/workflows/ci.yml  ← SERIALISE with R2)
         │
 R2  F2 audit fix   ── apps/api/app/routers/catalog.py  +  apps/api/tests/test_audit.py
     (independent)
         │
         ▼
   make verify  (re-covers §9 Gates 1–6 + the two new sync/audit proofs)  ──►  ⏸ G human verify
```

**Parallel on disjoint files:** **R1 ∥ R2.** R1 is entirely root + `packages/shared` + `scripts/*` + `apps/web/**`; R2 is entirely `apps/api/app/routers/catalog.py` + `apps/api/tests/test_audit.py`. No shared source file → **two workers in parallel**. **Serial edge:** both R1 and R2 add lines to `Makefile` and `.github/workflows/ci.yml` (R1 adds `api-types-sync`; R2 needs no Makefile change but CI re-runs the api job) — coordinate those two shared files on one worker (land R1's Makefile/CI edit, R2 touches neither). Everything funnels into `make verify` → ⏸ G.

### 10.4 P1-UI re-coverage (the REWORK must keep all 13 green)

The REWORK touches the P1-UI items only as follows; every proof node-id is unchanged (manifest stable → `check_requirements_sync` green → no version bump).

| AC | Proof node-id | REWORK interaction |
| --- | --- | --- |
| AC1 | `apps/api/tests/test_auth_rbac.py::test_role_guard_blocks_wrong_role` | none — keep green |
| AC2 | `apps/api/tests/test_admin.py::test_approve_provider_flips_flag` | none — keep green |
| AC3 | `apps/api/tests/test_catalog_crud.py::test_create_entry_each_type` | none — keep green |
| AC4 | `apps/api/tests/test_assets.py::test_upload_then_fetch` | none — keep green |
| AC5 | `apps/api/tests/test_catalog_access.py::test_set_brand_safe_and_access_scope` | **F2**: `set_access` now also writes audit rows; response shape unchanged → **stays green** (verify explicitly) |
| AC6 | `apps/api/tests/test_visibility_contract.py::test_agent_never_sees_unapproved` | none — keep green |
| AC7 | `apps/api/tests/test_catalog_search.py::test_filter_by_destination_and_type` | none — keep green |
| AC8 | `apps/web/tests/formats.test.ts::test_format_presets` | **F1**: web becomes a workspace member; vitest must still pass after `@walsh/shared` wiring |
| AC9 | `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design` | **F1**: same — keep green |
| AC12 | `apps/api/tests/test_export.py::test_pdf_and_html_from_design` | none — keep green |
| AC16 | `apps/api/tests/test_ai_provider.py::test_factory_selects_and_falls_back` | none — keep green (stub fallback unchanged) |
| AC17 | `apps/api/tests/test_seed.py::test_seed_is_idempotent_and_complete` | **F1**: root `package.json`/`turbo.json`/`pnpm-workspace.yaml` added; `docker compose config -q` still valid |
| AC18 | `scripts/tests/test_acceptance_matrix.py::test_evaluate_classifies_met_partial_missing` · `scripts/tests/test_requirements_sync.py::test_sync_detects_missing_and_extra` · `apps/web/e2e/studio-smoke.spec.ts::studio smoke` | **F1**: e2e runs through the workspace build — the AC18 studio-smoke is the primary regression guard for the restructure |

New tests added by the REWORK are **both unmatrixed** (Contract-level, not AC): `scripts/tests/test_api_types_sync.py::test_detects_pydantic_drift` (F1) and `apps/api/tests/test_audit.py::test_set_access_unpublish_and_overwrite_are_logged` (F2). No manifest row → `check_requirements_sync` stays green → **`/REQUIREMENTS.md` stays v1.0.0** (Primary path). Only the Fallback amendment would bump the version, and only with user approval at ⏸ G.

### 10.5 Determinism / secrets / citations (REWORK-specific)
- **Determinism:** `scripts/dump_openapi.py` writes with `sort_keys=True`; `openapi-typescript` is deterministic for a fixed input; the drift guard compares byte-for-byte. Audit rows carry only integer ids (actor/target) — no PII. (Contract 4 / `testing.md`.)
- **Secrets:** the client moved to `packages/shared/src/client.ts` keeps the Contract-2 invariant (never logs the token or any provider key); `openapi.json` is schema-only (no keys, no data). (Contract 2 / `security.md`.)
- **Citations** (`.claude/rules/citations.md` — these are contestable design choices):
  - *Generate the TS contract from the FastAPI OpenAPI schema (single source of truth + regenerate-on-change):* **openapi-typescript — openapi-ts.dev / openapi-ts GitHub — https://openapi-ts.dev/ , https://github.com/openapi-ts/openapi-typescript (accessed 2026-10-01).** Supports FastAPI's `/openapi.json`, emits runtime-free types; "when the backend changes, you regenerate, and the compiler shows you every place that needs updating" — exactly the compile-time link F1 is missing.
  - *turborepo is proportionate for this repo size, not overhead:* **Monorepo JS tooling fundamentals — mironsoft.de — https://www.mironsoft.de/en/blog/monorepo-js-tooling-fundamentals (accessed 2026-10-01)** ("with few completely independent packages … overhead often outweighs the benefit" — hence the Fallback stays available) and **Turborepo Monorepo Guide — ecosire.com — https://ecosire.com/blog/turborepo-monorepo-guide (accessed 2026-10-01)** (turbo's value lands at ~2–10 packages — where this repo sits). Together they justify Primary (conform) *and* keep Fallback (amend) honestly on the table.

## 11. REWORK plan — two new design-change findings (MANAGER re-pass, RE-ENTRY, outer 0/4 · inner 1/2, 2026-10-01)

**Why this section exists.** Two review findings prove the acceptance matrix was reporting *met* for a
capability that is **not actually delivered** (AC13) and for a **broken architectural invariant**
(Contract 1 / AC6 via the Builder). Both are contract-vs-code conflicts (CLAUDE.md: "treat a conflict
between code and `/REQUIREMENTS.md` as a bug in the code"), so they are fixed by **reworking the two
offending API contracts**, not by local patches. They are **distinct from §10's F1/F2** (module boundary
/ `set_access` audit, already landed). This §11 is the concrete REWORK: exact files/functions/config, the
dependency graph, and a proof test per change — and it **re-covers** the P1-UI items (AC1,2,3,4,5,6,7,8,9,
12,16,17,18) in §11.6, each of which must stay green.

### 11.0 Root cause (shared by both findings)

Two agent-facing surfaces accept catalog **content straight from the client** instead of resolving catalog
**IDs server-side through the Contract-1 choke-point** (`app/services/visibility.py`), which every *read*
path already uses:

- **F3 / AC13 (video):** `POST /render/video` (`apps/api/app/routers/render.py:40-51`) hardcodes
  `encode_video(build_scene_script(body.items), None, …)` — the `images` arg is literally `None` and
  `VideoRequest` (`render.py:35-37`) exposes **no image field**. So the entire image branch in
  `media/video.py` (`render_video`'s `images` param, `build_scene_cmd`'s `-loop/-i` path, `render.py` line
  77-78/136-137) is **unreachable from the API** — every rendered video is a solid-colour background. The
  code is exercised only by `test_video.py` unit tests; the AC13 "from selected catalog images" capability
  is **not delivered**, yet the matrix shows AC13 met.
- **F4 / AC6+AC10 (Builder):** `POST /builder/design` (`apps/api/app/routers/builder.py:32-39`) builds
  `BuilderItem` objects from **client-supplied** `body.items[].id/title/destination/description`
  (`builder.py:20-29,38`) and never loads the entries from the DB or runs them through
  `is_visible_to_agent`/`agent_visible_entries`. `ai/builder.py`'s docstring (lines 1-9, 84-113) claims
  output is "grounded in the selected catalog items" and "every op is validated against the selected items
  so ungrounded output is dropped" — but "selected items" = whatever the agent posted, so the grounding is
  **purely client-trusted**. An agent can compose a design around unapproved / not-brand-safe / out-of-scope
  / fabricated content, defeating Contract 1. Every other agent read funnels through `visibility.py`; the
  Builder is the one seam that does not.

**The single fix for both:** accept **IDs only**, resolve them **server-side** through the visibility
choke-point, and build from the **verified rows** (and, for video, from those rows' **approved stored
assets**). This closes F3 *and* F4 and makes the matrix require the real capability.

### 11.1 Shared prerequisite — R0 (land first; both R1 and R2 depend on it)

- **`apps/api/app/services/visibility.py` — add one choke-point helper (reuses `is_visible_to_agent`):**
  ```python
  def agent_visible_entries_by_ids(
      db: Session, agent: User, ids: Sequence[int]
  ) -> list[CatalogEntry]:
      """Resolve entry ids the agent may see, in request order; dupes/unknown/hidden dropped."""
      seen: set[int] = set()
      out: list[CatalogEntry] = []
      for eid in ids:
          if eid in seen:
              continue
          seen.add(eid)
          entry = db.get(CatalogEntry, eid)
          if entry is not None and is_visible_to_agent(entry, agent):
              out.append(entry)
      return out
  ```
  This is the *only* new access rule, and it delegates to the existing single predicate — the two write
  surfaces now share the same Contract-1 gate as the read surfaces (no rule can drift).
- **`apps/api/app/models/catalog.py` — expose approved asset keys for the agent UI:** add a read-only
  property on `CatalogEntry` so `EntryOut` can carry them (needed so the Builder can place *real* approved
  images client-side and the studio can show which items have imagery):
  ```python
  @property
  def asset_keys(self) -> list[str]:
      return [a.object_key for a in self.assets]
  ```
- **`apps/api/app/schemas/catalog.py` — `EntryOut`:** add `asset_keys: list[str] = []` (populated via
  `from_attributes` from the property above). Only visible entries are ever serialised to agents (read
  choke-point), and agents may already `GET /assets/{key}` for those entries — so no new exposure.

### 11.2 R1 — F4 Builder rework (IDs only, server-resolved, grounded in verified rows)

- **`apps/api/app/routers/builder.py` (rewrite the request contract + route):**
  - **Delete** `BuilderItemIn` (client no longer supplies item content).
  - `DesignRequest` becomes: `prompt: str = Field(min_length=1, max_length=2000)` +
    `item_ids: list[int] = Field(min_length=1, max_length=50)`.
  - Add `db: Session = Depends(get_db)` and bind the agent (`agent: User = Depends(_agent_only)`), import
    `agent_visible_entries_by_ids`.
  - Body of `design`:
    ```python
    entries = agent_visible_entries_by_ids(db, agent, body.item_ids)
    if not entries:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No visible catalog items for the given ids")
    items = [BuilderItem(e.id, e.title, e.destination, e.description) for e in entries]
    return build_design(body.prompt, items, get_provider(settings)).to_dict()
    ```
  - `ai/builder.py` is **unchanged** (it already validates ops against the items it is handed; now those
    items are the *verified* rows, so the docstring's grounding guarantee becomes true). AC10's unit proof
    (`test_builder_stub_is_deterministic`, which calls `build_design` directly) stays green.
- **`apps/web/components/studio/BuilderPanel.tsx`:** `run()` sends `{ prompt, item_ids: items.map(i => i.id) }`
  (was `items: [...]`). `applyBuilderOps` still maps `op.item_id` → the local `items` entry for client-side
  image placement (unchanged) — it just no longer *sends* title/description. Keep the `generate` injection
  seam for the vitest.

### 11.3 R2 — F3 Video rework (scenes reference catalog IDs; images server-resolved from approved assets)

- **`apps/api/app/routers/render.py` (rewrite `VideoRequest` + `/video`):**
  - New request shape (keeps the AC13 "Agent can edit scenes/text" capability — free-text title/caption is
    intended; only the *images* must be catalog-grounded):
    ```python
    class VideoScene(BaseModel):
        item_id: int | None = None          # which catalog item's image backs this scene (None -> colour bg)
        title: str = Field(default="", max_length=200)
        caption: str = Field(default="", max_length=200)

    class VideoRequest(BaseModel):
        scenes: list[VideoScene] = Field(min_length=1, max_length=20)
        narrate: bool = False
    ```
  - Add deps: `db: Session = Depends(get_db)`, `storage: Storage = Depends(get_storage)`,
    `agent: User = Depends(_agent_only)`. Import `agent_visible_entries_by_ids`, `get_storage`, `Storage`.
  - Route logic (server-resolved images; **no client file paths**, preserving the existing docstring
    guarantee; falls back to colour bg per scene when the item is not visible / has no asset):
    ```python
    requested = [s.item_id for s in body.scenes if s.item_id is not None]
    visible = {e.id: e for e in agent_visible_entries_by_ids(db, agent, requested)}
    scenes = build_scene_script([{"title": s.title, "description": s.caption} for s in body.scenes])
    with tempfile.TemporaryDirectory(prefix="vid-src-") as srcdir:
        images: list[str | None] = []
        for s in body.scenes:
            entry = visible.get(s.item_id) if s.item_id is not None else None
            path = None
            if entry is not None and entry.asset_keys:
                try:
                    data, _ct = storage.get_object(entry.asset_keys[0])
                    path = str(Path(srcdir) / f"img{len(images)}")
                    Path(path).write_bytes(data)
                except KeyError:
                    path = None
            images.append(path)
        out = encode_video(scenes, images, tts=body.narrate)
        with open(out, "rb") as fh:
            data = fh.read()
    ```
    (keep the existing `try/except -> 503/500` wrapper around the encode). The `images` list is **aligned by
    scene index**, exactly what `render_video` consumes (`media/video.py:136`); a non-visible or image-less
    scene passes `None` → `build_scene_cmd` colour branch. The image branch is now **live from the API**.
  - `media/video.py` needs **no change** (the branch already exists and is already unit-tested); R2 makes it
    reachable. `build_scene_script` keeps its signature → AC13 unit proof stays green.
- **`apps/web/components/studio/VideoPanel.tsx`:** replace `scenesToRequestItems` with
  `scenesToRequest(scenes): { item_id: number|null; title: string; caption: string }[]` (drop blank-title
  scenes, keep `itemId` as `item_id`), and `render()` sends `{ scenes: scenesToRequest(scenes), narrate }`
  (was `{ items, narrate }`). `scenesFromItems`/`applyBuilderCopy` already carry `itemId` — unchanged.

### 11.4 Regen + studio wiring — R3 (serial, after R1 ∥ R2)

- **Regenerate the contract (drift guard will otherwise red the build):**
  `make api-types-sync`'s inputs change because `DesignRequest`, `VideoRequest`, and `EntryOut` changed →
  run `node scripts/gen-api-types.mjs` to rewrite `packages/shared/openapi.json` +
  `packages/shared/src/api-types.ts`, commit both. `@walsh/shared`'s `builderDesign`/`renderVideo` types
  follow automatically (generated). No hand-edit of `client.ts` needed.
- **`apps/web/app/agent/studio/page.tsx` — feed the panels REAL approved catalog ids** (so `item_ids`
  resolve server-side): on mount `listAgentCatalog()` → map each `Entry` to a `BuilderCatalogItem`
  `{ id, title, destination, description, imageSrc? }`, where `imageSrc` is `await fetchAssetObjectUrl(e.asset_keys[0])`
  when present. Replace the synthetic `PANEL_ITEMS` (hardcoded `id:1`) with this loaded list; keep a
  proportionate loading/empty state. (Multi-select UX stays out of scope — the loaded visible catalog is the
  selection set for the PoC; this is the minimal wiring that makes AC10/AC13 genuinely end-to-end.)

### 11.5 Dependency graph + parallelisation (disjoint files)

```
 R0  shared prereq  ── app/services/visibility.py (+1 fn)  +  app/models/catalog.py (+property)
     (land FIRST)       +  app/schemas/catalog.py (EntryOut.asset_keys)
         │
         ├───────────────┬───────────────────────────────┐
         ▼               ▼                                 (disjoint: no shared source file)
 R1 Builder (F4)    R2 Video (F3)
   app/routers/builder.py          app/routers/render.py
   tests/test_builder.py           tests/test_video.py
   web BuilderPanel.tsx            web VideoPanel.tsx
         │               │
         └───────┬───────┘
                 ▼
 R3  regen + wiring (SERIAL)  ── packages/shared/{openapi.json,src/api-types.ts} (regenerated)
                                 +  apps/web/app/agent/studio/page.tsx
                 │
                 ▼
          make verify  ──►  ⏸ G human verify
```

- **R0 is a hard prerequisite** for both (both import the new resolver; both depend on `EntryOut.asset_keys`
  only on the web side, so R0's api part unblocks R1/R2 api work immediately).
- **R1 ∥ R2 run in parallel** — fully disjoint files (builder router/test/panel vs render router/test/panel).
- **R3 is serial** — it regenerates the two shared `packages/shared` artefacts (which depend on *both* R1
  and R2's schema changes) and edits the one shared `studio/page.tsx`. Do R3 once, after R1+R2 land.
- Manifest edits (§11.7) touch only `requirements.manifest.yaml` — land with R3.

### 11.6 One test per acceptance item (P1-UI re-coverage — all 13 stay green)

| AC | Proof node-id (manifest) | REWORK interaction |
| --- | --- | --- |
| AC1 | `apps/api/tests/test_auth_rbac.py::test_role_guard_blocks_wrong_role` | none — keep green |
| AC2 | `apps/api/tests/test_admin.py::test_approve_provider_flips_flag` | none — keep green |
| AC3 | `apps/api/tests/test_catalog_crud.py::test_create_entry_each_type` | none — keep green |
| AC4 | `apps/api/tests/test_assets.py::test_upload_then_fetch` | **R0**: `EntryOut.asset_keys` added (additive, optional default) → stays green; verify explicitly |
| AC5 | `apps/api/tests/test_catalog_access.py::test_set_brand_safe_and_access_scope` | none — keep green |
| **AC6** | `apps/api/tests/test_visibility_contract.py::test_agent_never_sees_unapproved` **+ NEW** `apps/api/tests/test_builder.py::test_builder_route_resolves_ids_through_visibility` | **R1**: Builder now funnels through the Contract-1 choke-point → AC6's invariant is matrixed on the Builder seam too |
| AC7 | `apps/api/tests/test_catalog_search.py::test_filter_by_destination_and_type` | none — keep green |
| AC8 | `apps/web/tests/formats.test.ts::test_format_presets` | **R3**: types regen; vitest must still pass |
| AC9 | `apps/web/tests/studio-ops.test.ts::test_manual_ops_mutate_design` | **R3**: same — keep green |
| AC12 | `apps/api/tests/test_export.py::test_pdf_and_html_from_design` | none — keep green |
| AC16 | `apps/api/tests/test_ai_provider.py::test_factory_selects_and_falls_back` | none — stub fallback unchanged |
| AC17 | `apps/api/tests/test_seed.py::test_seed_is_idempotent_and_complete` | none — keep green |
| AC18 | `scripts/tests/test_acceptance_matrix.py::…` · `scripts/tests/test_requirements_sync.py::…` · `apps/web/e2e/studio-smoke.spec.ts::studio smoke` | **R3**: e2e runs through regenerated types + live-catalog studio page; studio-smoke (login→browse→studio→export) is the primary web regression guard |

**Finding-specific proofs (one per finding; both strengthen an existing matrixed AC rather than adding an
unmatrixed test, so the matrix can never again report the capability green while it is undelivered):**

- **F4 / AC6** — NEW `apps/api/tests/test_builder.py::test_builder_route_resolves_ids_through_visibility`:
  seed (a) an approved+brand-safe entry the agent can see, (b) a draft/unapproved entry, (c) an
  out-of-scope entry (restricted `allowed_tenant_ids`); POST `{prompt, item_ids:[a,b,c, 999999]}` as the
  agent → assert the returned design's ops reference **only `a`**, that `b`/`c`/the bogus id are absent, and
  that `item_ids:[b]` (all hidden) → **404**. Proves the Builder is now bound to the choke-point (Contract 1).
  Also update `test_builder_route_agent_only_and_stub` to the `item_ids` shape.
- **F3 / AC13** — NEW `apps/api/tests/test_video.py::test_video_route_renders_catalog_image`:
  seed an approved entry + an `Asset` row + its bytes in the in-memory storage; monkeypatch
  `render_mod.encode_video` to capture `(scenes, images)`; POST scenes `[{item_id: approved}, {item_id: <hidden>}]`
  → assert `images[0]` is a real temp file whose bytes equal the seeded PNG (**image branch reachable from
  the API**) and `images[1] is None` (hidden item → colour bg, Contract 1 on images). Add this as a **second
  AC13 proof** in the manifest so AC13 is only `met` when the catalog-image path actually works. Also update
  `test_video_route_agent_only` to the `scenes` shape.
- AC10/AC13 **unit** proofs (`test_builder_stub_is_deterministic`, `test_scene_script_deterministic_and_cmd_shape`)
  are untouched by the rework (they call `build_design`/`build_scene_script`/`render_video` directly) and stay
  green.

### 11.7 Manifest / governance (no scope change → `/REQUIREMENTS.md` stays v1.0.0)

- **`requirements.manifest.yaml`:** add the F4 test as a **second `AC6.api`** proof and the F3 test as a
  **second `AC13.api`** proof. This changes **no AC set** (still exactly AC1–AC18) → `check_requirements_sync`
  stays green; it only *raises the bar* (AC6/AC13 now require the Contract-1/image-capability proofs to pass,
  like AC18's 3/3). No wording/scope edit to `/REQUIREMENTS.md` → **no version bump**.
- The acceptance text is already satisfied by the rework: AC13 "from selected catalog images" and AC6
  "agents only ever see approved, brand-safe entries" are now *actually* enforced on these two surfaces, so
  no softening/strengthening of the spec is needed. (If the reviewer prefers the Builder-grounding proof to
  matrix under AC10 instead of AC6, that is an equivalent manifest-only move — AC10 is P2 and out of this
  phase's charter, so §11 attaches it to AC6, the P1 Contract-1 item.)

### 11.8 Determinism / secrets / citations (REWORK-specific)

- **Determinism:** resolver preserves request order and de-dupes; video image temp files are created in a
  `TemporaryDirectory` and cleaned on exit; tests assert on **bytes/None**, never on temp path strings; AI
  stays the deterministic stub (no keys). (Contract 4 / `testing.md`.)
- **Secrets / Contract 2:** no client file paths are ever accepted (video reads only server-held approved
  assets via the `Storage` interface); `EntryOut.asset_keys` lists only keys of entries the agent may already
  read; synthetic 1×1 PNG fixtures; nothing logs tokens or provider keys. (Contract 2 / `security.md`.)
- **Citations** (`.claude/rules/citations.md`):
  - *Resolve IDs server-side through the single visibility choke-point instead of trusting client content:*
    **no external source — this applies the repo's own established Contract-1 pattern**
    (`apps/api/app/services/visibility.py`, already used by every read path) to the two write surfaces that
    skipped it; it is a conformance fix, not a novel design.
  - *Loop a still image into an ffmpeg clip (`-loop 1 -t <dur> -i <img>`):* **FFmpeg Filters/Formats docs —
    https://ffmpeg.org/ffmpeg-formats.html , https://trac.ffmpeg.org/wiki/Slideshow (accessed 2026-10-01).**
    Confirms the already-present `build_scene_cmd` image branch is the idiomatic still-to-video input — the
    code was correct; only the API wiring to reach it was missing.
