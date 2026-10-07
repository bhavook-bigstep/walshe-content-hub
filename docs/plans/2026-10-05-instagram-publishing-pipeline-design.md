# Design Spec — Instagram Publishing Pipeline

**Date:** 2026-10-05 · **Status:** draft (awaiting user review) · **Branch:** `dev`
**Topic:** Take finished content from the agent Studio and publish it to Instagram — grounded per-platform copy → human review/approval → publish to a real IG account, with a deterministic offline stub throughout.

> This spec is the design artifact for the brainstorming → spec → plan loop. It is Instagram-only
> (the first platform); the connector is written as an abstraction so later platforms (Facebook, X,
> LinkedIn, YouTube, blog) drop in behind the same interface. It extends the governing
> `/REQUIREMENTS.md` with new acceptance items **AC49–AC57** (version bump + change-log row + user
> approval required before the build loop treats them as contract).

---

## 1. Intent & success criteria

**Intent.** Today the social layer stops at a *simulated* send (`REQUIREMENTS.md` explicitly defers
"real reach / social-media integration"). This feature builds the deferred frontier for **one real
platform, Instagram**: an agent turns an approved Studio composition into a platform-tailored post
(image + caption + hashtags + alt-text), a reviewer or the owning content board approves it, and the
system publishes it to a real Instagram account — or to a deterministic stub when no keys are set.

**Who it's for.** Tourism **Agents** (create + submit), **Reviewers / content boards** (approve),
Super Admin (oversight). Not consumer-facing.

**Success criteria.**
1. An agent can draft an Instagram post from a composition, with AI-drafted caption/hashtags/alt-text
   grounded only in approved catalog content, edit it, and submit it for review.
2. A reviewer (dedicated role) **or** the content provider/board whose content is used can approve or
   send it back with a reason.
3. An approved post publishes to a **real Instagram account** (create-container → poll → publish) and
   returns a live media id / permalink; with no keys configured it publishes to a **stub** instead.
4. Everything is auditable (Contract 3), deterministic/offline in tests (Contract 4), leaks no secrets
   (Contract 2), and never exposes unapproved content (Contract 1).
5. `make verify` stays green (incl. the OpenAPI→TS drift gate) and the new ACs are proven.

**Non-goals (PoC).** Other platforms; publishing to accounts the business does not own (that needs
Meta App Review + Advanced Access); per-agent OAuth account connect; real engagement/insights
ingestion; reliable deletion of a live post.

---

## 2. Locked decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Instagram only** for the PoC; connector written as an abstraction for later platforms. | User-selected; keeps scope shippable. |
| D2 | **Instagram API with Instagram Login** (`graph.instagram.com`), scopes `instagram_business_basic` + `instagram_business_content_publish`. | No Facebook Page / Business Manager needed; fewer scopes; single documented refresh endpoint. ([Meta – Instagram API overview](https://developers.facebook.com/docs/instagram-platform/overview/)) |
| D3 | Post to **one account the business owns** in **development mode / Standard Access** — **no App Review**. | App Review (+ business verification, weeks) is only required to post for accounts you don't own. ([Meta – Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)) |
| D4 | **Image hosting = AWS S3 with a presigned GET URL** (TTL comfortably longer than Meta's fetch window). | Instagram fetches media from a public URL server-side; S3 presigned is the clean, reachable path. |
| D5 | Review gate approver = **a new `reviewer` role OR the content provider/board** whose catalog items are used. | User-selected combination; reuses the brand-safety ownership model. |
| D6 | Copy = **AI drafts, agent edits**; full pipeline **auto-schedules** via a background dispatcher. | User-selected. (MVP slice is publish-now; the dispatcher lands in a later increment — see §9.) |
| D7 | **One shared, board-level** connected IG account for the PoC; token in **env only**, never the DB. | Keeps Contract 2 clean; per-agent OAuth connect is a future increment. |
| D8 | The business must **create the IG professional account, the Meta app, and an S3 bucket** (none exist yet). | Current state per user. Setup runbook in §10. This is the pacing item, not the code. |

---

## 3. Architecture

### 3.1 Data flow
```
Studio Composition (approved items + design)
   │  render chosen scene → JPEG (1080×1350, 4:5) ──► upload to S3 ──► presigned GET URL
   │  AI draft (grounded) ──► caption + hashtags[] + alt_text ──► agent edits
   ▼
POST /social/instagram/publish (or /posts draft)      PostStatus: draft
   │  submit ──► machine preflight (AC34, reused)      → in_review
   ▼
Reviewer / owning board: approve | send-back(reason)   → approved | changes_requested
   │  (full pipeline) scheduled_at set                 → scheduled
   ▼
Dispatcher: re-check (status==approved + preflight TOCTOU)   → publishing
   │  PublishConnector.publish(account, media_url, caption, …)
   ▼
Instagram (real) OR Stub   → published (external_id + permalink) | failed (error, retry)
```

### 3.2 Components (new unless noted)
- **`app/services/s3_media.py`** — upload JPEG bytes to S3, return a presigned GET URL. (adds `boto3`.)
- **`app/social/connectors/`** — `base.py` (`PublishConnector` interface), `instagram.py` (real Graph
  API v26.0), `stub.py` (deterministic, supersedes/absorbs `services/social_sim.py`), `factory.py`
  (real when `INSTAGRAM_ACCESS_TOKEN`+`IG_USER_ID` present, else stub — mirrors `app/ai/factory.py`).
- **`app/agents/instagram_copy.py`** — `draft_instagram(items, brief, provider, *, blocked_terms)`
  reusing `agents/creative_plan.build_plan` + a **second grounding pass** over caption/hashtags/alt-text.
- **`app/services/dispatcher.py`** — pure `dispatch_due_posts(db, now, *, publish)`; started by a new
  FastAPI **lifespan** asyncio poller in `main.py` (gated off in tests).
- **Extended `app/models/post.py`** — new columns + richer `PostStatus`; new `SocialAccount` model.
- **Routers** — extend `app/routers/social.py` (draft/submit/approve/send-back/publish/status) +
  `app/routers/builder.py` (`POST /builder/instagram-copy`); register in `main.py`.
- **Web** — `apps/web/app/agent/studio` "Publish to Instagram" action; `app/agent/social` "My posts"
  board; new `app/reviewer/*` review queue; a connected-account settings view; shared client fns.

---

## 4. Data model

### 4.1 `Post` (extend — safe under `create_all` because `PostStatus` is `native_enum=False`)
Add: `platform: str` (default `"instagram"`), `caption: Text`, `hashtags: JSON list[str]`,
`alt_text: str`, `media_object_key: str|None` (S3 key), `container_id: str|None` (IG creation id —
idempotency), `external_id: str|None` (published media id), `permalink: str|None`, `error: Text`,
`reviewed_by: int|None` FK users.id, `reviewed_at: datetime|None`, `review_reason: Text` (mirrors
`CatalogEntry.review_reason`), `account_id: int|None` FK social_accounts.id.

Widen `PostStatus` (keep `native_enum=False`) to:
`draft, in_review, changes_requested, approved, scheduled, publishing, published, failed, unpublished`.

### 4.2 `SocialAccount` (new)
`id, platform ("instagram"), ig_user_id: str, username: str, status ("connected"|"disconnected"|"token_expired"), connected_at`.
**No token column** — the long-lived token lives in env (`INSTAGRAM_ACCESS_TOKEN`); the row is metadata
only (Contract 2). PoC seeds one board-level account.

### 4.3 Migration note (gap #5)
`User.role` / `CatalogEntry.status` are **native Postgres enums** and there is **no Alembic** — tables
come from `create_all` (`apps/api/app/db.py:29`), which never `ALTER`s. Therefore:
- Define **all new enums `native_enum=False`** (VARCHAR) as `Post.status` already does
  (`models/post.py:26`).
- Adding `Role.reviewer` (a native enum value) requires a **one-time DB reset** (fresh dev/PoC DB) or a
  manual `ALTER TYPE role ADD VALUE 'reviewer'`. Documented as an explicit plan step. SQLite test DBs
  are always fresh, so tests are unaffected.

---

## 5. Instagram connector (real adapter) — reference

Base `https://graph.instagram.com/v26.0`. Token = long-lived IG user token (env). `{ig-user-id}` =
`IG_USER_ID`. Publishing is a **3-step async flow**; persist `container_id` so a retried publish never
double-posts.

1. **Create container** — `POST /{ig-user-id}/media` with `image_url` (the S3 presigned URL),
   `caption` (caption + hashtags + alt handled separately), optional `alt_text`. → returns container id.
2. **Poll** — `GET /{container-id}?fields=status_code` until `FINISHED` (values:
   `IN_PROGRESS|FINISHED|ERROR|PUBLISHED|EXPIRED`); ~1/min up to ~5 min; container expires in 24 h.
3. **Publish** — `POST /{ig-user-id}/media_publish` with `creation_id={container-id}` → returns the
   published media id; fetch `permalink` for the receipt.

**Limits baked into validation** (cite in the PR per `.claude/rules/citations.md`): caption ≤2,200
chars; ≤30 hashtags; ≤20 mentions; image **JPEG only**, ≤8 MB, aspect 4:5–1.91:1, width 320–1440 px.
Daily post cap is **not hardcoded** — read `GET /{ig-user-id}/content_publishing_limit` at runtime.
([Meta – Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/))

**Token lifecycle:** short-lived (1 h) → long-lived (60 days) via `ig_exchange_token`; refresh via
`GET /refresh_access_token?grant_type=ig_refresh_token` (token must be ≥24 h old; renews 60 days). A
lapsed token needs an interactive re-auth. ([Meta – Access Token](https://developers.facebook.com/docs/instagram-platform/reference/access_token/) · [Refresh token](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/)) PoC: refresh automation is a fast-follow (a 60-day token won't lapse during the demo).

**Error / retry policy:** fail-fast on non-public URL (`2207052`), unsupported format (`2207005`/`2207026`),
restricted account (`2207050`); retry with backoff on download timeout (`2207003`), not-ready
(`9007`/`2207027`), rate/5xx (`4/17/32/613`); on token-expired (`190`) refresh then retry once.
([Meta – error codes](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/error-codes))

**Stub connector:** three deterministic JSON returns (container id → `{"status_code":"FINISHED"}` →
`{"id":"stub-…"}`) + a fake `content_publishing_limit`. Same interface as the real client; default when
no keys. Keeps egress out of tests/demos (Contract 2/4).

---

## 6. AI per-platform copy (grounded)

New `draft_instagram(items, brief, provider, *, blocked_terms) -> InstagramDraft(caption, hashtags[], alt_text, sources, ready, issues)`:
1. `plan = build_plan(items, replace(brief, format="instagram"), provider, blocked_terms=…)` — reuses the
   existing grounded copy + claim-grounding (`agents/creative_plan.py`).
2. Compose caption from already-grounded `headline/body/supporting_points`; derive hashtags from grounded
   source tokens (destination/type/markets/title); derive alt-text from lead title + destination.
3. **Second grounding pass** (gap #4): run caption sentences + each hashtag + alt-text through
   `validate_plan`/`_ground_claim` against `items`; drop/flag ungrounded; set `ready` accordingly.
   (`validate_plan` today covers only headline/body/supporting-points, not hashtags/alt-text.)
4. Enforce IG limits deterministically (truncate caption on a word boundary ≤2200; ≤30 hashtags; alt-text
   cap). Keep the `provider.name == "stub"` deterministic branch — the stub's `complete()` output is not
   parseable.
Endpoint `POST /builder/instagram-copy` (agent-only; `item_ids` or `composition_id`) → `record_run(...)`
trace. Caption and hashtags are returned as **separate fields**, each independently within limits
(Instagram counts hashtags inside the 2,200-char caption, so the client composes within budget).

---

## 7. Review workflow, roles, authority, audit

- **New `Role.reviewer`** across: API enum (`models/user.py`), token claim (already generic —
  `security.create_token`), `admin.create_user` (set `approved=True` for reviewer; today it only
  approves agents — `admin.py:61`), web role union + `middleware.ts` matcher + `AppShell` nav + a new
  `/reviewer` section, seeds + test fixtures (currently 3 roles only).
- **Lifecycle transitions** mirror the catalog send-back pattern verbatim (`routers/catalog.py:158`
  `send_back`, `schemas/catalog.py:75` `SendBackRequest`): submit → `in_review`; approve → `approved`
  (clear reason, audit `action="approve"`); send-back → `changes_requested` with required non-blank
  reason (422 if blank), audit `action="send_back"`.
- **Approval authority** (gap resolved): allow if `user.role == reviewer` **OR**
  `user.role == content_provider and user.tenant_id in owning_tenants`, where
  `owning_tenants = { User(entry.provider_id).tenant_id for entry in composition items }` — there is no
  `tenant_id` on `CatalogEntry`, so resolve via `entry.provider_id → User.tenant_id` and handle
  `None`/missing defensively. Return **404** (not 403) to avoid existence leaks, matching
  `catalog.send_back`. Also handle `reviewer` in `audit_log._rows` visibility.
- **TOCTOU re-check at publish** (Contract 1): the dispatcher/publish path re-reads `status==approved`
  from the DB and re-runs `preflight.run_preflight` (which re-applies the visibility choke-point) with the
  injected `now`, so an item withdrawn/expired after approval blocks the publish.
- **Audit** (Contract 3): `audit.record(...)` for submit/approve/send-back/publish/unpublish — the
  `action` column is a free string, so new verbs need no schema change.

---

## 8. Media, dispatcher, egress, contracts

- **JPEG export (gap #1):** no server-side rasterizer exists and the client PNG is never persisted
  (`apps/web/lib/studio/render.ts`, `ExportMenu.tsx`). The web renders the chosen scene to **JPEG**
  (Fabric `toDataURL({format:"jpeg"})`) at 1080×1350 and uploads it; the server stores it at
  `posts/{id}/{uuid}.jpg` and validates JPEG/size.
- **Public URL (gap #2):** `s3_media.upload_jpeg(bytes) -> (key, presigned_url)` (boto3; `boto3` added to
  `pyproject.toml`). Presigned GET TTL > Meta fetch window and ideally > container life. Stub needs no URL.
- **Dispatcher (gap #3):** add a FastAPI `lifespan=` to `create_app` (none exists today) that starts an
  asyncio poller calling the pure `dispatch_due_posts(db, now)`; gate it off under tests (TestClient
  triggers lifespan). The pure core is tested directly with a fixed clock (Contract 4). Get a session
  outside a request via `with app.state.sessionmaker() as db:` (the established pattern).
- **Egress / secrets (Contract 2, security.md):** the real IG call is the project's first outbound
  egress — isolated behind the connector, only to `graph.instagram.com`, only when keys are set; the
  token comes from env and is never stored in the DB or logged (log connector *name* only, mirroring
  `app/ai/factory.py`). S3 creds likewise env-only.
- **OpenAPI→TS drift gate (gap #6):** any contract change must be followed by
  `node scripts/gen-api-types.mjs` + commit of the regenerated `packages/shared/openapi.json` &
  `api-types.ts`, or `make verify` (`check_api_types_sync.py`) fails. An explicit step in every task.

---

## 9. Increment plan (MVP-first — "post something tomorrow" is Increment 1)

> Each increment ships green behind stubs. Increment 1 is the thin vertical that can actually post to a
> real IG account once the Meta/S3 setup (§10) is done; it intentionally skips the review gate and AI
> grounding, which land in 2–3.

- **Increment 1 — Publish a real image + caption (MVP).** Config + `.env.example`; `s3_media.py`;
  `PublishConnector` interface + Instagram real adapter + stub + factory; `POST /social/instagram/publish`
  (composition + caption + exported JPEG → S3 → IG → media id/permalink; audited); Studio "Publish to
  Instagram" (JPEG export + caption box + result link); tests (stub + mocked httpx + fixed clock) + regen
  types. **Depends on §10 setup for a *real* post; fully testable without it via the stub.**
- **Increment 2 — Review gate + reviewer role.** `Role.reviewer` end-to-end; `Post` review fields +
  widened status; submit/approve/send-back (mirror catalog); approval authority; `/reviewer` queue;
  TOCTOU re-check; audit.
- **Increment 3 — Grounded AI copy.** `instagram_copy.py` + `/builder/instagram-copy` + second grounding
  pass; Studio uses it to prefill caption/hashtags/alt-text (agent edits).
- **Increment 4 — Scheduling.** `scheduled_at` + lifespan dispatcher + pure `dispatch_due_posts`;
  "My posts" status board; failure/retry surfacing.
- **Increment 5 — Hardening.** Token refresh job; `content_publishing_limit` gating; connected-account
  settings view; engagement seam (real insights deferred).

---

## 10. Setup runbook (business must do — pacing item)

**Instagram / Meta (create everything):**
1. Set the IG account to **Business/Creator**.
2. developers.facebook.com → create a **Business app** → add **Instagram** product → "Instagram API
   setup with Instagram business login"; note App ID/secret + a valid OAuth redirect URI.
3. App → **Instagram Testers** → add the IG account; **accept** the invite from the IG account
   (Settings → Apps and websites → Tester invites). Keep the app in **Development mode**.
4. One-time OAuth: authorize with scopes `instagram_business_basic,instagram_business_content_publish`
   → exchange code → short-lived token → **long-lived (60-day) token**; fetch the numeric IG user id.
   (A ~10-minute curl/script sequence will be provided.)
5. Put `INSTAGRAM_ACCESS_TOKEN`, `IG_USER_ID` in the server env (never committed).

**AWS S3 (have account, need bucket):**
1. Create a bucket (single region); block public ACLs — we use **presigned GET**, not public objects.
2. Create an IAM user/key with `s3:PutObject`/`s3:GetObject` on that bucket only (least privilege).
3. Put `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in the server env.

---

## 11. New acceptance criteria (AC49–AC57) → `/REQUIREMENTS.md` + `requirements.manifest.yaml`

- **AC49** — Instagram connector abstraction: real Graph API adapter + deterministic stub; factory by
  env; tests mock `httpx`, no egress. (api)
- **AC50** — S3 media hosting: JPEG exported at IG-valid dimensions, uploaded, presigned GET URL
  returned; non-JPEG/oversized rejected. (api + web)
- **AC51** — `POST /social/instagram/publish` publishes (stub) and returns media id/permalink; audited
  (Contract 3). (api)
- **AC52** — Outbound-post review lifecycle (draft→in_review→approved→published) + send-back-with-reason.
  (api)
- **AC53** — `reviewer` role + approval authority (reviewer OR owning board); RBAC enforced; 404 on
  non-owner. (api + e2e)
- **AC54** — Grounded Instagram copy (caption ≤2200, ≤30 hashtags, alt-text), re-grounded; ungrounded
  wording dropped/flagged; deterministic under the stub. (api)
- **AC55** — TOCTOU re-check at publish (approved + preflight) upholds Contract 1. (api)
- **AC56** — Dispatcher auto-publishes due approved posts via pure `dispatch_due_posts(db, now)` under a
  fixed clock. (api)
- **AC57** — Playwright: agent drafts → submits; reviewer approves; (stub) publish shows published +
  permalink. (e2e)

Governance: bump `/REQUIREMENTS.md` version + add a change-log row (needs user approval), add each AC's
proofs to `requirements.manifest.yaml`, and ensure `make verify` (lint → api-test → api-types-sync →
web-typecheck → web-test → e2e → matrix → sync → compose-config) passes.

---

## 12. Risks & open items

1. **Meta setup is the schedule risk**, not the code — a real post tomorrow hinges on the account/app/
   token being ready (§10). The stub path needs none of it.
2. **Token expiry (60 days)** — fine for the PoC; refresh automation is Increment 5.
3. **DB reset for `reviewer`** (native enum, no Alembic) — one-time, acceptable for the PoC.
4. **Presigned URL reachability** — the server's S3 must be internet-reachable by Meta (it is); a local
   MinIO/localhost would not be.
5. **Unpublish** — the publishing API can't reliably delete a live post; "unpublish" is local-state +
   best-effort for real IG (out of PoC scope to fully delete).
6. **Citations** — the IG numeric limits and any chosen alt-text cap must carry a citation or the
   "No source found" disclaimer in the implementing PR (`.claude/rules/citations.md`).

---

## 13. Spec self-review

- **Placeholders:** none — every section is concrete; numeric limits sourced to Meta docs.
- **Consistency:** the MVP (Increment 1) deliberately omits the review gate/AI/scheduler named in the
  architecture; §9 states this explicitly so the staging is not a contradiction.
- **Scope:** single subsystem (Instagram publishing); decomposed into increments, each independently
  buildable + testable. No unrelated refactoring.
- **Ambiguity:** approval authority, caption/hashtag budgeting, and the token/egress boundary are pinned
  to one interpretation each.
