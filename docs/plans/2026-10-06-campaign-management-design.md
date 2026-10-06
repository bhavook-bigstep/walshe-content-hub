# Campaign Management — Design

| | |
| --- | --- |
| **Status** | Draft for review |
| **Date** | 2026-10-06 |
| **Author** | engineers@bigsteptech.com (with Claude Opus 4.8) |
| **Supersedes / builds on** | `docs/plans/2026-10-05-instagram-publishing-pipeline-design.md`, `docs/plans/2026-10-06-engagement-insights-design.md` |
| **Governing spec** | `/REQUIREMENTS.md` (new ACs added under Governance, below) |

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
| `starts_on` | `Date` | Campaign window start (drives the calendar + "active" state). |
| `ends_on` | `Date` | Campaign window end. |
| `status` | enum (`native_enum=False`) | `draft` \| `active` \| `completed`. PoC create defaults to `active`; `draft` exists for a campaign still being assembled (the diagram's start node). Lightweight metadata for the campaigns list — **post firing never depends on it**. |
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
Campaign(draft) ──activate──▶ Campaign(active) ───────────────────────────▶ Campaign(completed)
        │
        ▼  (agent, in Studio)
  Post: draft ──schedule (render+capture image, set scheduled_at)──▶ pending_approval
                                                                          │
                                           reviewer reject (review_note)  │  reviewer approve
                                               ◀──────────── rejected ◀───┤  (set approved_by,
                                               │  edit + resubmit         │   reviewed_at)
                                               └──────────────────────────┤
                                                                          ▼
                                                                      approved ───────────┐
                                                                          │               │ agent cancel
                                                                          │               ▼
                                   dispatcher: now >= scheduled_at        │           cancelled
                                   (claims row: approved → publishing)    │
                                                                          ▼
                                                                      publishing
                                                              success │        │ PublishError / any exc
                                                                      ▼        ▼
                                                                  published   failed
                                                                      │
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
(`apps/api/app/routers/social.py:110-123`). The two pipelines stay fully isolated.

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
   `s3_media.public_url(settings, key)` helper (to add in Inc 2) and calls
   `connector.publish(image_url=..., caption=...)`. The deterministic stub ignores the URL.

Rejected alternative: a headless Fabric/puppeteer renderer at dispatch time — a heavy new runtime
dependency outside PoC scope, and non-deterministic. Capture-at-schedule reuses code we already
ship and keeps the worker pure.

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
| `POST /campaigns/{id}/posts` | 1 | Schedule a composition into the campaign; multipart rendered JPEG; lands `pending_approval` (or `draft` if no `scheduled_at`). Validates ownership of the composition. |
| `POST /campaigns/{id}/posts/{post_id}/approve` | 2 | `can_review` → `approved` + `approved_by`/`reviewed_at`; audited. |
| `POST /campaigns/{id}/posts/{post_id}/reject` | 2 | `can_review` → `rejected` + `review_note`; audited. |
| `POST /campaigns/{id}/posts/{post_id}/cancel` | 2 | Owner → `cancelled`; audited. |
| `GET /campaigns/{id}/analytics` | 3 | Aggregated metrics + per-post breakdown + series. |

The dispatcher (Inc 2) is **not** an endpoint — it is a lifespan background worker (§8).

## 8. Background dispatcher (Inc 2) — mirrors the insights worker

Same shape as `_insights_worker` (`apps/api/app/main.py:45-82`): a lifespan `asyncio` task gated by
a new settings flag (`campaign_dispatch_enabled`, **off in tests**), looping
`asyncio.sleep(campaign_dispatch_interval_seconds)` → a pure, clock-injected service function:

```
dispatch_due_posts(db, connector, now) -> int   # apps/api/app/services/campaign_dispatch.py
```

- Selects posts matching the §4 predicate, **ordered by `scheduled_at`**.
- For each: claim the row (`approved → publishing`, committed) as a double-dispatch lock, then
  `connector.publish(...)` via `get_connector(settings)` (real IG or stub by env).
- Wrap each post in `try/except Exception` so one failure can never abort the sweep (the same
  resilience posture the engagement sync adopted). Success → `published` + `external_id` /
  `permalink` / `published_at`. Any exception → `failed` + `error`.
- Every transition `audit.record`-ed (Contract 3). Returns the count published.

## 9. Increments

- **Increment 1 (build now): Campaign + calendar.** `Campaign` model + `Post` columns + enum
  values; `POST/GET /campaigns`, `GET /campaigns/{id}`, `POST /campaigns/{id}/posts` (with
  capture-at-schedule); web `app/agent/campaigns/` — campaigns list, create form, and a month
  **calendar** showing a campaign's posts by `scheduled_at`, status-chipped; agent-home quick-link.
  Posts land in `pending_approval`. **Nothing fires yet.**
- **Increment 2: Approval + dispatcher.** `can_review` seam; approve/reject/cancel endpoints +
  minimal review UI (approve/reject buttons on the calendar/post detail); the
  `dispatch_due_posts` worker; `s3_media.public_url` helper.
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
  `media_object_key` set; `draft` when no `scheduled_at`.
- State machine (Inc 2): legal transitions only; `can_review` allow/deny; audit rows written.
- Dispatcher (Inc 2): picks only `approved && due && campaign_id`; **never** legacy `scheduled`;
  one failing post doesn't abort the sweep; idempotent claim prevents double publish; stub
  connector + fixed clock → deterministic.
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
- Dispatcher publishes due approved posts via the real connector (stub in tests) and never touches
  legacy manual posts.
- Campaign analytics aggregate post metrics (labelled as aggregate, not unique reach).

## 13. Open decisions (flag at spec review)

1. **Approver identity** (§5): PoC allows owner-agent or super_admin. If the business workflow is
   "agency employee creates, manager/client approves", we keep the `can_review` seam but may want a
   `reviewer` role sooner. Deferred unless you say otherwise.
2. **Campaign `status`** (`draft/active/completed`): included as lightweight metadata; could be
   derived purely from dates instead. Kept explicit for a clean campaigns list.

## References

[1] *Insights — Instagram Platform — Meta for Developers* — Meta —
https://developers.facebook.com/docs/instagram-platform/insights/ (accessed 2026-10-06). Defines
the media `reach` metric as the total number of **unique** accounts that have seen the media
object — the basis for labelling summed campaign reach as *aggregate post reach*, not unique
campaign-level reach (§6, review point 5).
