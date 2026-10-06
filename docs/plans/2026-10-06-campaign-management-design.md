# Campaign Management — Design

| | |
| --- | --- |
| **Status** | Draft for review |
| **Date** | 2026-10-06 |
| **Author** | engineers@bigsteptech.com (with Claude Opus 4.8) |
| **Supersedes / builds on** | `docs/plans/2026-10-05-instagram-publishing-pipeline-design.md`, `docs/plans/2026-10-06-engagement-insights-design.md` |
| **Governing spec** | `/REQUIREMENTS.md` (new ACs added under Governance, below) |

*Rev 2026-10-06b: added delivery semantics & crash recovery (§8.1).*
*Rev 2026-10-06c (review round 2): reframed delivery as bounded at-least-once **attempts**; made the
`approved→publishing` claim an **atomic** conditional update (§8); rebuilt recovery on the documented
container `status_code` and reframed `publish_container_id` as a correlation handle, not an idempotency
token (§8.1); added `PATCH` edit/reschedule semantics (§7.1); added UTC timezone + campaign-window
rules (§4.1); simplified campaign status to `active`/`completed` (§3); added a live-reconcile
verification gate (§13.3).*

## 1. Context & goal

A tourism **agent** runs destination marketing as *campaigns*. The product today lets an agent
compose creatives in the Studio, publish one-off posts to Instagram (real connector), and view
engagement. What is missing is the organising layer the agent actually thinks in:

> Create a campaign (e.g. "3N/4D Australia", August) → make several creatives in the Studio →
> schedule each as a dated/timed post → a reviewer approves → approved posts **auto-publish** on
> their scheduled date/time → each post collects engagement → the campaign rolls those up into
> campaign-level analytics.

This design adds that layer. It is **Instagram-only** for the PoC, but every new seam
(platform, social account, metric registry) stays platform-generic so Facebook / X / YouTube /
blog can be added later without a reshape.

### Non-goals (YAGNI)

- No headless server-side Fabric renderer (see §4, capture-at-schedule).
- No dedicated reviewer **role** or reviewer console UI (the approval *gate* is real; the *who*
  is a documented seam — §5).
- No per-agent social OAuth / multi-account (shared Instagram account for the PoC; `social_account`
  is a documented seam at the post level — §3).
- No recurring/repeat schedules, no cross-platform fan-out of one creative.

## 2. Review adjustments folded in

This design incorporates seven corrections from design review:

1. **Three increments** (§9) — kept.
2. **Full lifecycle defined now** (§4), even though implementation is incremental.
3. **Approval is orthogonal to scheduling** (§4): `scheduled_at` is a *timestamp* (the schedule);
   `status` is the *approval/publish lifecycle*. A post fires only when it is **both** `approved`
   **and** due (`scheduled_at <= now`). `approved` therefore never means "publish now".
4. **Approver ≠ owner** (§5): the post records `approved_by` / `reviewed_at`, and the permission
   check routes through a `can_review(user, post)` seam. The PoC default allows the owning agent
   **or** a super admin, but **nothing in the data model assumes the approver is the owner** — a
   dedicated reviewer role drops in later with no schema change.
5. **Campaign analytics are aggregated post metrics, not unique reach** (§6). Metrics are labelled
   "Total Post Reach / Total Views / …" with an explicit note that summed reach double-counts
   accounts that saw more than one post. Instagram defines reach as *unique accounts that saw the
   media* [1], so a campaign sum is **aggregate post reach**, not unique people reached.
6. **Platform & social account live at the post level** (§3). `Campaign` is platform-agnostic.
   Our existing `Post` already carries `platform` + `scheduled_at` (+ a future `social_account_id`
   seam), so **`Post` plays the "CampaignPost" role**; `destination` is demoted to optional
   descriptive metadata, never structural.
7. **Build on existing analytics** (§6): campaign analytics is a GROUP-BY over the existing
   `Engagement` snapshots + `PostInsightsSync`, joined via `Post.campaign_id`. No second analytics
   system is introduced.

## 3. Data model

### New: `Campaign` (`apps/api/app/models/campaign.py`)

Platform-agnostic container owned by an agent.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | PK | |
| `agent_id` | FK → `users.id` | Owner / creator. **Not** assumed to be the approver (§5). |
| `name` | `String(120)` | e.g. "3N/4D Australia". |
| `destination` | `String(120)`, nullable | Optional descriptive metadata only (e.g. "Australia"). **Not** structural; does not drive routing or platform. |
| `starts_on` | `Date` | Campaign window start (drives the calendar + window validation, §3.1). |
| `ends_on` | `Date` | Campaign window end. |
| `status` | enum (`native_enum=False`) | `active` \| `completed` only. Created `active`; no `draft` and no activation step for the PoC (there is no campaign-draft UI — YAGNI). Lightweight metadata for the campaigns list — **post firing never depends on it**. |
| `created_at` | `DateTime(tz)` | |

### Extended: `Post` (`apps/api/app/models/post.py`)

`Post` already carries `composition_id`, `channel`, `platform`, `caption`, `hashtags`, `alt_text`,
`media_object_key`, `external_id`, `permalink`, `error`, `scheduled_at`, `published_at`. We add:

| Column | Type | Notes |
| --- | --- | --- |
| `campaign_id` | FK → `campaigns.id`, **nullable** | Null = standalone/legacy post (manual `/social` + `/social/instagram` flows are unchanged). |
| `approved_by` | FK → `users.id`, nullable | Who approved (§5). Decouples approval authority from `campaign.agent_id`. |
| `reviewed_at` | `DateTime(tz)`, nullable | When the approve/reject decision was made. |
| `review_note` | `Text`, default `""` | Optional reviewer note (used on reject). |
| `publish_container_id` | `String(100)`, nullable | The IG `creation_id`, persisted the instant the container is created, **before** `media_publish`. A persisted **external correlation handle** used to resume/reconcile an interrupted publish — not an idempotency token of our own (§8.1). |
| `publish_started_at` | `DateTime(tz)`, nullable | When the dispatcher claimed the row (`approved → publishing`). Drives the stale-claim reaper (§8.1). |
| `publish_attempts` | `Integer`, default `0` | Incremented on each claim; capped by `max_publish_attempts` → terminal `failed`, never an infinite loop (§8.1). |

`platform` (already present, default `"instagram"`) and a **future** `social_account_id` are the
post-level seam for multi-platform/multi-account campaigns. We do **not** add `social_account_id`
now (no OAuth yet) — it is noted here so the shape is anticipated, not built (YAGNI).

### Extended: `PostStatus` enum

`PostStatus` is `native_enum=False` (a plain string column), so **adding values is a no-op
migration** on both SQLite (dev/test) and Postgres. Existing values are untouched.

| Value | Meaning | New? |
| --- | --- | --- |
| `scheduled` | **Legacy** manual `/social/schedule` state (awaiting manual publish). Campaign posts never use this. | existing |
| `published` | Live on the platform. | existing |
| `failed` | A publish attempt failed. | existing |
| `draft` | Campaign post created/edited, not yet scheduled (no `scheduled_at`). | **new** |
| `pending_approval` | Scheduled (`scheduled_at` set), awaiting review. | **new** |
| `approved` | Reviewed & armed. Fires when due. Records `approved_by`/`reviewed_at`. | **new** |
| `publishing` | Transient — the dispatcher has claimed it and the publish call is in flight (double-dispatch lock). | **new** |
| `rejected` | Reviewer rejected; `review_note` explains. Agent edits → re-submits → `pending_approval`. | **new** |
| `cancelled` | Agent unscheduled before it fired. | **new** |

## 4. Lifecycle (full state machine — defined now, implemented incrementally)

Two orthogonal dimensions: **approval/publish status** and the **`scheduled_at` timestamp**.

```
Campaign: created active ───────────────────────────────────────────────▶ completed
        │
        ▼  (agent, in Studio)
  Post: draft ──schedule (render+capture image, set scheduled_at)──▶ pending_approval
                                                                          │
                              reviewer reject (review_note)               │  reviewer approve
                                  ◀──────────────── rejected ◀────────────┤  (set approved_by,
                                  │  PATCH edit (re-capture media,         │   reviewed_at)
                                  │  clear approval fields) → ─────────────┤
                                  └────────────────────────────────────▶  ▼
                                      pending_approval               approved ──────────┐
                                                                          │             │ agent cancel
                                   dispatcher: now >= scheduled_at        │             ▼
                                   (atomic claim: approved → publishing)  │         cancelled
                                                                          ▼
                              reaper resumes a stale ───────────────▶ publishing
                              publishing row (§8.1)                 ╱            ╲
                                                            success╱              ╲ non-retryable / attempts>max
                                                                  ▼                ▼
                                                              published          failed
                                                                  │          (retryable: left for next tick)
                                                                  ▼
                              (existing) PostInsightsSync pulls Engagement snapshots → post analytics
                                                                  │
                                                                  ▼
                                                    campaign analytics = GROUP BY campaign (§6)
```

**"Scheduled / armed" is derived, not a stored state** — it is exactly `status == approved AND
scheduled_at > now`. "Due" is `status == approved AND scheduled_at <= now`. The dispatcher's
selection predicate is:

```
status == approved  AND  campaign_id IS NOT NULL  AND  scheduled_at <= now
```

Because the predicate is keyed on the **new** `approved` state and a non-null `campaign_id`, the
dispatcher can never pick up the legacy `scheduled` posts from the manual `/social/schedule` flow
(`apps/api/app/routers/social.py:110-123`). The two pipelines stay fully isolated. A row stuck in
`publishing` (worker died mid-publish) is **not** lost — it is recovered separately by the reaper
(§8.1).

### Capture-at-schedule (the headless-worker constraint)

The dispatcher runs server-side with **no browser**, so it cannot re-render the Fabric canvas.
Therefore the creative image is **captured when the post is scheduled**, while the canvas is live:

1. In the Studio, scheduling a campaign post renders the composition to JPEG with the existing
   `renderDesignToJpegBlob` (`apps/web/lib/studio/render.ts`) and uploads it multipart — the same
   mechanism the manual IG publish already uses (`apps/api/app/routers/instagram.py:40-85`).
2. The schedule endpoint validates JPEG magic bytes + 8 MB limit (reused from the IG path), stores
   the bytes through the storage abstraction (`apps/api/app/storage/s3_media.py` → S3/MinIO when
   configured; in-memory for the keyless dev/test path), and sets `post.media_object_key`.
3. At dispatch (Inc 2), the worker resolves the public URL from `media_object_key` via a small
   `s3_media.public_url(settings, key)` helper (to add in Inc 2). The **IG container is created at
   dispatch time, not schedule time** — a container expires 24 h after creation [2], so it must be
   created when we are about to publish, not when the post is scheduled (which may be weeks out).
   The deterministic stub ignores the URL.

Rejected alternative: a headless Fabric/puppeteer renderer at dispatch time — a heavy new runtime
dependency outside PoC scope, and non-deterministic. Capture-at-schedule reuses code we already
ship and keeps the worker pure.

### 4.1 Scheduling rules: timezone & campaign window

**Timezone.** `scheduled_at` is stored and compared in **UTC** (the column is already
`DateTime(timezone=True)`). The web client converts the agent's chosen local date/time to an
absolute instant (ISO-8601 with offset / `Z`) before sending; the API persists UTC; the dispatcher
compares absolute instants (`now_utc >= scheduled_at_utc`). The calendar and post UI render times
back in the **browser's local timezone**, so an India-based agent sees IST while the scheduler
reasons in UTC — no "published 5.5 h off" surprises. A stored per-agent/per-org timezone is a
future refinement, not built now (the browser's own timezone is sufficient for the PoC).

**Campaign window.** A campaign post's `scheduled_at` **must fall within the campaign's
`[starts_on, ends_on]` window**, inclusive, evaluated against the agent's local calendar date; the
schedule endpoint (and PATCH reschedule) returns **422** otherwise. This is a deliberate PoC
constraint — if we later want pre-campaign teasers we will relax it explicitly rather than by
accident.

## 5. Approval (Inc 2) — gate real, authority a seam

- Approve / reject / cancel are explicit actions, **separate from scheduling** (§2.3).
- Authorisation routes through a single seam `can_review(user, post) -> bool`
  (`apps/api/app/services/campaign_review.py`). PoC implementation: `True` when
  `user.role == super_admin` **or** `user.id == post.campaign.agent_id`. The call sites never
  hardcode the owner; swapping in a dedicated reviewer role later is a one-function change.
- Approve sets `status=approved`, `approved_by=user.id`, `reviewed_at=now`. Reject sets
  `status=rejected`, `review_note`, `reviewed_at`. Cancel sets `status=cancelled`. Every
  transition is `audit.record`-ed (Contract 3).
- Self-approval is allowed in the PoC but is a deliberate, logged action (not implicit on
  scheduling), so the gate is demonstrable. This is the one place a reviewer would say "the
  business wants a different approver" — flagged for the spec review.

## 6. Analytics (Inc 3) — aggregate over existing snapshots

Campaign analytics introduces **no new storage**. It is a read-time rollup:

- **Per-post** (already works): `PostInsightsSync` + `Engagement` snapshots; `latestByPost` gives
  the current cumulative metrics per post (`apps/web/lib/engagement/metrics.ts`).
- **Per-campaign**: `GET /campaigns/{id}/analytics` joins `Engagement → Post` on
  `Post.campaign_id == {id}`, takes the latest snapshot per post, and **sums** each metric across
  the campaign's published posts, plus a per-post breakdown table and a snapshot-based time series.
- **Labelling (review point 5):** campaign metrics are rendered as **"Total Post Reach", "Total
  Views", "Total Likes", "Total Comments", "Total Saves", "Total Shares", "Total Interactions"**,
  with a one-line caption: *"Totals add each post's metrics; reach is summed per post and may
  count an account that saw several posts more than once."* Instagram defines reach as unique
  accounts per media object [1], so the campaign sum is **aggregate post reach**, not unique
  campaign-level reach. This matters more once multiple platforms report reach differently.
- Reuses `app/social/metrics.py` (API registry) and `lib/engagement/metrics.ts` (web) unchanged —
  the metric set is still platform-driven, so a new platform adds its keys in one place.

## 7. API surface

All routes agent-scoped to the owner the way `/engagement` is today, except approve/reject which
additionally honour `can_review`.

| Route | Increment | Purpose |
| --- | --- | --- |
| `POST /campaigns` | 1 | Create a campaign (name, destination?, starts_on, ends_on). |
| `GET /campaigns` | 1 | List the agent's campaigns (with lightweight status + counts). |
| `GET /campaigns/{id}` | 1 | Campaign detail + its posts (for the calendar). |
| `POST /campaigns/{id}/posts` | 1 | Schedule a composition into the campaign; multipart rendered JPEG; validates composition ownership + campaign window (§4.1); lands `pending_approval` (or `draft` if no `scheduled_at`). |
| `PATCH /campaigns/{id}/posts/{post_id}` | 1 | Edit / reschedule a post (§7.1). Allowed only in `draft` / `rejected` / `pending_approval`. |
| `POST /campaigns/{id}/posts/{post_id}/approve` | 2 | `can_review` → `approved` + `approved_by`/`reviewed_at`; audited. |
| `POST /campaigns/{id}/posts/{post_id}/reject` | 2 | `can_review` → `rejected` + `review_note`; audited. |
| `POST /campaigns/{id}/posts/{post_id}/cancel` | 2 | Owner → `cancelled`; audited. |
| `GET /campaigns/{id}/analytics` | 3 | Aggregated metrics + per-post breakdown + series. |

The dispatcher (Inc 2) is **not** an endpoint — it is a lifespan background worker (§8).

### 7.1 Edit / resubmit / reschedule semantics

Editing is how a `rejected` post gets fixed and how an agent reschedules before approval. The rule
for the PoC: **editing updates the existing `Post` row in place** (it does not spawn a new post).
`PATCH /campaigns/{id}/posts/{post_id}` (multipart, all fields optional):

- Allowed **only** while `status ∈ {draft, pending_approval, rejected}`. Editing an `approved`,
  `publishing`, or `published` post is **409** — approved/in-flight/live work is immutable; to
  change it the agent cancels and creates a new post.
- A new rendered JPEG (if supplied) **replaces** the captured media: stored at a fresh
  `media_object_key`; the old object is left in storage (orphan cleanup is out of PoC scope — noted).
- `caption` and `scheduled_at` may change; a changed `scheduled_at` is re-validated against the
  campaign window (§4.1).
- The edit **clears the approval fields** (`approved_by`, `reviewed_at`, `review_note`) and returns
  the post to `pending_approval` if a `scheduled_at` is present, else `draft`. A fix always re-enters
  review — an edit can never keep a stale approval.
- Composition: the post keeps its `composition_id`; editing re-captures from the (possibly
  Studio-updated) composition. The `Composition` itself is edited in the Studio, independently.
- Audited (Contract 3).

## 8. Background dispatcher (Inc 2) — mirrors the insights worker

Same shape as `_insights_worker` (`apps/api/app/main.py:45-82`): a lifespan `asyncio` task gated by
a new settings flag (`campaign_dispatch_enabled`, **off in tests**), looping
`asyncio.sleep(campaign_dispatch_interval_seconds)` → a pure, clock-injected service function:

```
dispatch_due_posts(db, connector, now) -> int   # apps/api/app/services/campaign_dispatch.py
```

- Selects posts matching the §4 predicate **plus** stale `publishing` rows to recover (§8.1),
  **ordered by `scheduled_at`**, via `get_connector(settings)` (real IG or stub by env).
- The publish is **split across commits so a crash is recoverable** (§8.1). Per post:
  1. **Claim (atomic)** — a single **conditional update** is the lock, not a read-then-write:
     ```sql
     UPDATE posts SET status='publishing', publish_started_at=:now, publish_attempts=publish_attempts+1
     WHERE id=:id AND status='approved'
     ```
     The dispatcher proceeds only if **exactly one row was updated**; a `rowcount == 0` means
     another execution already claimed it, so this one skips. (On Postgres the equivalent is a
     `SELECT … FOR UPDATE SKIP LOCKED` claim.) **PoC assumption:** we run a **single** dispatcher
     instance (one lifespan worker), so the claim is uncontended; the conditional update is what
     keeps it correct if the API is ever scaled to multiple instances — see §8.1.
  2. **Create + persist container** — `connector.create_container(...)` → persist
     `publish_container_id`; **commit before publishing**.
  3. **Publish** — `connector.publish_container(container_id)` → `published` + `external_id` /
     `permalink` / `published_at`.
- Each post is wrapped in `try/except Exception` so one failure can never abort the sweep (the same
  resilience posture the engagement sync adopted). A non-retryable `PublishError` / any unexpected
  exception → `failed` + `error`; a retryable one is left for the next tick (bounded by
  `max_publish_attempts`, §8.1).
- Every transition `audit.record`-ed (Contract 3). Returns the count published.

### 8.1 Delivery semantics & recovery (bounded at-least-once attempts)

**Delivery semantics: bounded at-least-once *attempts*.** A due, approved post is **never silently
dropped** — it always reaches a terminal, observable state (`published` or `failed`). The dispatcher
retries recoverable failures and reconciles stale `publishing` attempts; after `max_publish_attempts`
the post transitions to `failed` (visible, not lost). This is deliberately weaker than "published at
least once": we do **not** guarantee a post is ever successfully published — a persistently failing
one ends in `failed`. And it is **not** exactly-once: `media_publish` is an external side effect that
cannot commit in the same transaction as our DB write, and the Graph API honours no idempotency token
of ours (the connector's `idempotency_key` arg is ignored by the IG adapter today,
`apps/api/app/social/instagram.py`). So a *successful* publish may, in a narrow crash window, happen
**more than once** (a duplicate) — never zero times without the post landing in `failed`. We make
that window small, make duplicates detectable, and reconcile wherever Meta's API lets us.

**The orphaned-`publishing` problem.** The claim `approved → publishing` is committed *before* the
publish call, so if the process dies mid-publish the row is stuck in `publishing` and the normal
predicate (`status == approved`) will never pick it up again. `publishing` rows therefore need an
explicit recovery path, or posts would be silently dropped.

**Recovery via the container `status_code` (documented reconcile).** The IG publish is a 3-step flow
(create container → poll `FINISHED` → `media_publish`). The dispatcher persists the **container id
(`creation_id`) the instant the container is created, before `media_publish`** — a persisted
external **correlation handle** (§3), not an idempotency token of ours. The **reaper** — the same
sweep, selecting `publishing` rows whose `publish_started_at` is older than
`campaign_dispatch_reaper_timeout_seconds` — resumes each orphan by reading the container's
**documented** `status_code` [2] (`GET /{container-id}?fields=status_code`):

- `PUBLISHED` → the media already went live before the crash. **Reconcile** the media id / permalink
  (do **not** re-publish) and mark `published`. **No duplicate.**
- `FINISHED` → the container is ready but was not published; call `publish_container(id)`. Safe.
- `EXPIRED` / `ERROR`, or **no `publish_container_id`** at all → no live media resulted; **re-create**
  from the captured image, within the attempt cap. (Containers expire 24 h after creation [2] and we
  create them at dispatch, so an expired container simply means "start over".)

Correctness here rests on a **documented** container status, not on the undocumented behaviour of a
repeated `media_publish`. The one residual duplicate window is a crash *between* Instagram accepting
`media_publish` and our commit of `published`, **while the container status has not yet flipped to
`PUBLISHED`** — kept small and bounded by the attempt cap. **This reconcile path must be smoke-tested
against the real Graph API before its acceptance criterion is promoted (§12, §13.3).**

**Bounded retries.** `publish_attempts` is incremented on every claim; past `max_publish_attempts`
(default 3) the post goes terminal `failed` with its last error, so a poisoned post can never loop
forever.

**Reaper timeout.** `campaign_dispatch_reaper_timeout_seconds` must exceed the **maximum legitimate
create → poll → publish duration** (dominated by video transcode polling), or the reaper could
reclaim a row a slow-but-healthy worker is still publishing. A per-worker lease id
(`publish_claim_id`) would remove that race entirely, but with a single PoC dispatcher it is
unnecessary — noted as the extension for a multi-worker deployment.

**Startup sweep.** On worker start the dispatcher runs one recovery pass, so a crash during a
deploy/restart is reconciled promptly instead of waiting a full interval.

**Connector contract (additive, back-compatible).** `publish()` stays unchanged for the manual IG
path (`apps/api/app/routers/instagram.py`); Inc 2 **adds** granular `create_container(...) ->
container_id`, `container_status(container_id) -> str` (the documented `status_code`),
`poll_until_ready(container_id)`, and `publish_container(container_id) -> PublishResult`; the
existing `publish()` becomes their composition. The stub implements the same split deterministically
— after a `publish_container` its `container_status` returns `PUBLISHED` — so the reaper's reconcile
path is exercised with no network (Contract 4).

**Acknowledged downstream.** Because a rare duplicate is possible, analytics treat each `Post` row
independently (a duplicate surfaces as two posts, not corrupted data), and the agent can
`/social/unpublish` or remove one on Instagram. The PoC does not auto-dedupe after the fact; it
minimises the window and records enough (`publish_container_id`, `external_id`) to detect one.

## 9. Increments

- **Increment 1 (build now): Campaign + calendar.** `Campaign` model + `Post` columns + enum
  values; `POST/GET /campaigns`, `GET /campaigns/{id}`, `POST /campaigns/{id}/posts` (with
  capture-at-schedule + window validation §4.1) and `PATCH .../posts/{id}` (edit/reschedule §7.1);
  UTC scheduling semantics (§4.1); web `app/agent/campaigns/` — campaigns list, create form, and a
  month **calendar** showing a campaign's posts by `scheduled_at` (rendered in the browser's
  timezone), status-chipped; agent-home quick-link. Posts land in `pending_approval`. **Nothing
  fires yet.**
- **Increment 2: Approval + dispatcher.** `can_review` seam; approve/reject/cancel endpoints +
  minimal review UI (approve/reject on the calendar/post detail); connector split
  (`create_container` / `container_status` / `poll_until_ready` / `publish_container`); the
  `dispatch_due_posts` worker with the **atomic claim**, the `status_code` reaper, bounded retries,
  and startup sweep (§8.1); `s3_media.public_url` helper. **Live reconcile smoke test (§13.3)
  before the recovery AC is promoted.**
- **Increment 3: Campaign analytics.** `GET /campaigns/{id}/analytics` rollup + the campaign
  analytics page (totals, per-post table, series), labelled per §6.

## 10. Security & contracts

- **Contract 1** (only approved/brand-safe content distributes): a campaign post still references a
  `Composition` built from already-approved catalog content; the schedule endpoint validates the
  agent owns the composition (reuses `_owned_composition`).
- **Contract 2** (no secrets/PII leave boundary): the shared IG token comes from env via the
  existing connector factory; never logged or returned. No new secret surface.
- **Contract 3** (destructive/stateful actions traceable): every approve/reject/cancel/publish
  transition is audited.
- **Contract 4** (reproducible; AI/connectors stubbed in tests): dispatcher is a pure function
  tested with a stub connector + fixed `now`; worker flag off in tests.

## 11. Testing & determinism

TDD throughout (RED → GREEN), per-task commits (`Co-Authored-By: Claude Opus 4.8`), **no push**.

- Model + enum: migration/metadata smoke; nullable `campaign_id` leaves legacy posts intact.
- Schedule endpoint: ownership 404; JPEG/size validation reused; lands `pending_approval`;
  `media_object_key` set; `draft` when no `scheduled_at`; **422 when `scheduled_at` is outside the
  campaign window** (§4.1).
- Timezone (§4.1): a `scheduled_at` sent with an offset is stored/compared as the correct UTC
  instant; due-ness (`now_utc >= scheduled_at_utc`) is offset-correct (an IST-entered time does not
  fire 5.5 h early/late).
- Edit / reschedule (§7.1): `PATCH` allowed in `draft`/`pending_approval`/`rejected` only (409
  otherwise); a new JPEG replaces `media_object_key`; a changed `scheduled_at` is window-validated;
  approval fields cleared → back to `pending_approval`; audited.
- State machine (Inc 2): legal transitions only; `can_review` allow/deny; audit rows written.
- Dispatcher (Inc 2): picks only `approved && due && campaign_id`; **never** legacy `scheduled`;
  one failing post doesn't abort the sweep; the **atomic conditional-update claim** updates exactly
  one row and a second concurrent sweep gets `rowcount == 0` and skips; stub connector + fixed clock
  → deterministic.
- Recovery (Inc 2, §8.1): a `publishing` row older than the reaper timeout is resumed by its
  container `status_code` — `PUBLISHED` → reconciles to `published` **without** re-publishing (no
  duplicate); `FINISHED` → publishes; `EXPIRED`/`ERROR`/no-container → recreates; `publish_attempts
  > max_publish_attempts` → terminal `failed`; the startup sweep reconciles a simulated mid-publish
  crash. (The stub's `container_status` returns `PUBLISHED` after a publish, so this is hermetic.)
- Analytics (Inc 3): sum across latest-per-post; scoped to the calling agent; empty campaign → zeros.
- Web: Vitest for the calendar date-bucketing + status chips (pure); one Playwright e2e for
  create-campaign + calendar render.

## 12. Governance (ACs)

New acceptance criteria will be added to `/REQUIREMENTS.md` + `requirements.manifest.yaml` with a
version bump + change-log row (needs user approval — batched with the still-pending Instagram /
engagement ACs under Task 9). Proposed (numbers assigned at governance time, after the dev
AC49–AC58 block):

- Campaign CRUD + agent scoping.
- Schedule-into-campaign captures the rendered creative at schedule time.
- Approval gate: no post auto-publishes unless `approved` **and** due; approver recorded.
- Dispatcher publishes due approved posts via the real connector (stub in tests), using an **atomic
  claim**, and never touches legacy manual posts.
- **Delivery: bounded at-least-once attempts** — a due approved post always reaches a terminal
  `published`/`failed` state and is never silently dropped; a worker crash mid-publish is recovered
  via the container `status_code` (reconciles instead of duplicating when `PUBLISHED`); retries are
  bounded (§8.1). *(Promote only after the real-Graph-API reconcile smoke test — §13.3.)*
- Campaign analytics aggregate post metrics (labelled as aggregate, not unique reach).

## 13. Open decisions (flag at spec review)

1. **Approver identity** (§5): PoC allows owner-agent or super_admin. If the business workflow is
   "agency employee creates, manager/client approves", we keep the `can_review` seam but may want a
   `reviewer` role sooner. Deferred unless you say otherwise.
2. **Campaign `status`** — **resolved**: dropped `draft`/activation; a campaign is created `active`
   and moves to `completed`. No campaign-draft UI for the PoC (§3).
3. **Verify Meta reconcile behaviour before promoting the recovery AC** (§8.1): the recovery design
   reads the container `status_code` and treats `PUBLISHED` as "already live, reconcile don't
   re-publish". The `status_code` values are documented [2], but the end-to-end reconcile (publish,
   then re-read status, then fetch the media by the container/`creation_id`) should be **smoke-tested
   once against the real Graph API** on the shared account before this becomes a hard acceptance
   criterion. Unit tests use the stub; this is the one live check. Needs your go-ahead to run a live
   post on the shared IG account (it creates one real post).

## References

[1] *Insights — Instagram Platform — Meta for Developers* — Meta —
https://developers.facebook.com/docs/instagram-platform/insights/ (accessed 2026-10-06). Defines
the media `reach` metric as the total number of **unique** accounts that have seen the media
object — the basis for labelling summed campaign reach as *aggregate post reach*, not unique
campaign-level reach (§6, review point 5).

[2] *Publish Content — Instagram Platform — Meta for Developers* — Meta —
https://developers.facebook.com/docs/instagram-platform/content-publishing/ (accessed 2026-10-06).
Documents the 3-step publish flow and the container `status_code` values
(`EXPIRED`/`ERROR`/`FINISHED`/`IN_PROGRESS`/`PUBLISHED`), and that a container expires 24 h after
creation — the basis for the §8.1 reconcile-on-`PUBLISHED` recovery path and the create-at-dispatch
timing (§4).
