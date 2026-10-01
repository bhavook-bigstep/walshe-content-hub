# Implementation Plan — Walsh Content Hub PoC

- **Date:** 2026-10-01 · **Phase:** C (Plan) of `/oneshot-poc:run` · **Outer/Inner:** 0/3 · 0/2
- **Governed spec (acceptance contract):** `/REQUIREMENTS.md` v1.0.0 (AC1–AC18) — this plan conforms to it, never the reverse.
- **Charter (scoping record):** `docs/plans/2026-10-01-requirements-charter.md` v2 · **Ledger:** `docs/plans/2026-10-01-run-ledger.md`
- **Brainstorm decision carried in:** `docs/brainstorms/2026-10-01-governing-requirements-file.md` → **Approach D** (governed Markdown + thin generated status matrix enforced in CI + acceptance).

> **Plan status (revised 2026-10-01, PLAN re-pass).** §1 (the user's governed + governing requirements file) has since **landed and is green** — `/requirements.manifest.yaml` + `scripts/acceptance_matrix.py` + `scripts/check_requirements_sync.py` + `.github/workflows/ci.yml` (`pytest scripts/tests` → 20 passed; sync guard → PASS, 18 in sync). This revision verifies every AC row below still holds, maps the four system contracts to their enforcing proofs (§6), and records the governance observation that Contract 3 has no dedicated AC. Live status is tracked in the run ledger's generated matrix, never here — this file remains the forward HOW, the ledger the status.

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
- **api base:** `apps/api/pyproject.toml` (fastapi, uvicorn, sqlalchemy, alembic, psycopg, pydantic-settings, python-jose/passlib, boto3/minio, reportlab, pytest, pytest-json-report, httpx); `app/main.py` (app factory + router registration), `app/config.py` (`Settings` from env), `app/db.py` (engine/`SessionLocal`), `app/deps.py` (`get_db`, `get_current_user`, `require_role`), `app/security.py` (hash/verify + token).
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
- **infra:** `infra/docker-compose.yml` (db, minio, createbuckets, api, web) + healthchecks; `app/seed.py:seed()` loads 3 users (one per role) + synthetic catalog (each type) + a composition + a published post with engagement; idempotent (upsert by stable ids).
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
