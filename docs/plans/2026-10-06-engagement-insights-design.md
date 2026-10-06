# Design Spec — Real, Platform-Aware Engagement Insights

**Date:** 2026-10-06 · **Status:** draft (awaiting user review) · **Branch:** `feat/instagram-pipeline` (continues the pipeline work)
**Topic:** Replace the seeded/mock engagement with **real Instagram analytics** for posts published through the hub, stored and displayed in a **platform-aware** shape so other platforms slot in later without a schema change.

> Builds directly on the Instagram publishing increment (connector seam, `Post.external_id`, the
> env-gated real/stub factory). Instagram-only for the PoC; the metric set is platform-driven so
> Facebook / X / YouTube / blog register their own metrics later. Extends `/REQUIREMENTS.md` with
> **AC58–AC61** (provisional numbering — follows the publishing increment's AC49–AC57; confirm when
> both land). Needs a version bump + change-log row + user approval before the build loop treats
> them as contract.

---

## 1. Intent & success criteria

**Intent.** The Engagement dashboard shows **real** Instagram numbers for posts the agent published
through the hub, refreshed automatically, with the metric set determined by the platform (so it's
correct per-platform and extensible).

**Who it's for.** Tourism **Agents** (view their posts' performance).

**Success criteria.**
1. For each post with an `external_id` (really published), the system pulls Instagram's media
   insights (reach, views, likes, comments, saved, shares, total_interactions) and stores them.
2. Data refreshes automatically **every 10 minutes** for posts ≤ 30 days old; each refresh appends a
   **snapshot** (so the dashboard can show growth over time).
3. The metric set is **platform-defined** via a registry — adding a platform later is one registry
   entry + an insights connector, no schema change.
4. With no Instagram keys / insights permission, a **deterministic stub** supplies metrics so the
   dashboard and tests work offline (Contract 4).
5. The dashboard renders whatever metrics the post's platform registry defines.
6. `make verify` stays green; new ACs proven.

**Non-goals (PoC).** Account-level insights (followers/profile reach); other platforms' real
connectors; historical backfill beyond what Instagram returns; click/website-tap tracking (not an
organic IG metric).

---

## 2. Locked decisions (from brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Rich media insights** (reach, views, likes, comments, saved, shares, total_interactions) | User-selected; a real dashboard, not just likes/comments. |
| D2 | Requires the **`instagram_business_manage_insights`** permission + a token regen (one-time) | Meta gates the insights edge behind it. Basic `like_count`/`comments_count` work without it as a fallback. ([Meta insights](https://developers.facebook.com/documentation/instagram-platform/insights)) |
| D3 | **Background periodic sync, every 10 minutes** (`INSIGHTS_SYNC_INTERVAL_SECONDS=600`) | User-selected cadence; media insights are cumulative totals, so each pull is the latest running number. |
| D4 | Poll only posts **≤ 30 days old** (`INSIGHTS_MAX_AGE_DAYS=30`) | Old posts' numbers are static; saves API calls. |
| D5 | **Snapshot per sync** (append a row with `fetched_at`) | Cumulative metrics + snapshots = a growth-over-time curve on the dashboard. |
| D6 | **Platform-aware metric registry + JSON metrics bag** (not rigid IG columns) | User requirement: the matrix adjusts per platform; later platforms add a registry entry, no migration. |
| D7 | Instagram-only for the PoC; connector/registry seam for later platforms | Scope. |

---

## 3. Architecture

```
every 10 min (lifespan worker)
  → select posts WHERE external_id IS NOT NULL AND published_at >= now-30d
     → for each: InsightsConnector.fetch_insights(external_id, media_type)   [IG real | stub]
        → dict{metric_key: int}  (keys defined by the platform's registry)
        → append Engagement(post_id, platform, metrics=JSON, fetched_at=now)
GET /engagement
  → rows (platform + metrics + fetched_at)  →  dashboard renders per the platform registry
```

### Components
- **`app/social/metrics.py`** — the **platform metric registry**: per platform, the metric
  definitions (key, label, order, applicable media types). Single source for *what to fetch* and
  *what to render*.
- **`app/social/insights.py`** — `InsightsConnector` interface + `InstagramInsights` (real, Graph
  API) + `StubInsights` (deterministic); selected by the existing env factory
  (`app/social/factory.py`).
- **`app/services/insights_sync.py`** — pure `sync_insights(db, connector, registry, now)` core +
  the lifespan worker that calls it every 10 min.
- **`app/main.py`** — add a FastAPI `lifespan` that starts the worker (gated off in tests).
- **Extended `app/models/engagement.py`** — platform-tagged JSON metrics + `fetched_at`.
- **`app/routers/engagement.py`** — return `platform` + `metrics` + `fetched_at`.
- **Web** — `app/agent/engagement/page.tsx` + `components/charts/EngagementChart.tsx` become
  **registry-driven** (render the platform's metric tiles + a per-metric trend line from snapshots).

---

## 4. Platform metric registry (`app/social/metrics.py`)

```python
@dataclass(frozen=True)
class MetricDef:
    key: str          # IG insights metric name, e.g. "reach"
    label: str        # dashboard label, e.g. "Reach"
    order: int

@dataclass(frozen=True)
class PlatformMetrics:
    platform: str
    metrics: tuple[MetricDef, ...]              # feed/default set
    reel_exclude: frozenset[str] = frozenset()  # keys not valid for reels, etc.
```

**Instagram registry (now):** `reach, views, likes, comments, saved, shares, total_interactions`
(labels + order defined). Reels/Stories applicability encoded via `reel_exclude` / media-type notes.
A `registry: dict[str, PlatformMetrics]` lookup keyed by `platform`; `metrics_for(platform, media_type)`
returns the applicable `MetricDef`s. **Adding Facebook/X/YouTube later = one new `PlatformMetrics`
entry + its connector.** Metric keys/labels are cited in the PR (Meta insights docs) per
`.claude/rules/citations.md`.

---

## 5. Data model (`app/models/engagement.py`)

Replace the rigid `impressions/clicks/engagement` columns with a platform-tagged snapshot:
```python
class Engagement(Base):
    id: int (pk)
    post_id: int (index)
    platform: str(20)                 # which registry to read
    metrics: JSON                     # {metric_key: int} per the platform registry
    fetched_at: datetime(tz)          # snapshot time (enables trend)
```
`native_enum`-free (JSON + str), so `create_all` needs no migration on a fresh PoC DB. **Seed update:**
`seed.py` / `seed_demo.py` write the new shape (platform="instagram", a `metrics` dict, `fetched_at`)
so the demo dashboard still looks alive without a live pull.

### Sync state (so a failed sync doesn't masquerade as stale data)
A small one-row-per-post table, upserted on **every** sync attempt (success *or* failure) — separate
from the `metrics` snapshots so a failing refresh is visible/debuggable instead of looking like the
numbers just stopped moving:
```python
class PostInsightsSync(Base):
    post_id: int (pk, fk posts.id)
    last_synced_at: datetime(tz)
    sync_status: str(20)       # "ok" | "error" | "never_synced"
    last_error: str  (Text, "")  # typed code + message when sync_status == "error", e.g. "insights_permission: ..."
```
The dashboard may surface a quiet "updated 3 min ago" / "⚠ last refresh failed" line per post (not
required, but the data is there). The metric snapshots are only appended on a successful fetch, so a
failed sync leaves the last-good curve intact while flagging the failure here.

---

## 6. Insights connector (`app/social/insights.py`)

Interface: `fetch_insights(self, *, external_id: str, media_type: str) -> dict[str, int]`.

- **`InstagramInsights`** (real): `GET {graph.instagram.com}/{version}/{media-id}/insights?metric=<registry keys>`
  for the applicable metrics; also reads basic `like_count`/`comments_count` via
  `GET /{media-id}?fields=like_count,comments_count` as a fallback/supplement. Maps Meta's response
  rows (`data[].name` / `.values[0].value` or `.total_value.value`) to `{key:int}`. Errors
  (permission missing → code `insights_permission`, token expiry → `token_expired`, rate limit) are
  typed `PublishError`-style and surfaced without crashing the sync. Uses `settings` token (env).
  (`views` replaced `impressions`, removed Apr 2025 — we never request `impressions`.)
- **`StubInsights`** (deterministic): returns registry-shaped metrics derived deterministically from
  `external_id` (e.g. a hash → stable pseudo-numbers), so offline/tests are reproducible (Contract 4).
- **Factory:** extend `app/social/factory.py` with `get_insights_connector(settings)` — real when
  `instagram_configured()`, else stub. Logs the name, never the token (Contract 2).

---

## 7. Background sync (`app/services/insights_sync.py` + lifespan)

- **Pure core:** `sync_insights(db, connector, registry, now, *, post_ids=None) -> int` — selects
  posts with `external_id` and `published_at >= now - INSIGHTS_MAX_AGE_DAYS` (or the explicit
  `post_ids` for an on-demand refresh), calls the connector per post, and on success **appends an
  `Engagement` snapshot**; on failure records the typed error. **Every attempt upserts the post's
  `PostInsightsSync` row** (`last_synced_at`, `last_status`, `last_error`). Clock injected
  (Contract 4); per-post errors are caught + recorded, the loop continues; returns the success count.
- **Manual refresh (your request):** `POST /engagement/refresh` (agent-only) runs `sync_insights`
  for the calling agent's own published posts right now, so a "Refresh from Instagram" button in the
  dashboard gives an immediate pull without waiting for the 10-min tick.
- **Token source (seam for later per-user tokens):** the connector/sync obtains the access token via
  a small resolver rather than reading `settings` directly — env-backed today, swappable for a
  stored **per-user** token once the "Connect Instagram" (OAuth) increment lands (see note below). So
  this increment is forward-compatible with per-agent accounts without a rewrite.
- **Lifespan worker:** add `lifespan=` to `create_app` (none today) that starts an `asyncio` task
  looping every `INSIGHTS_SYNC_INTERVAL_SECONDS` (default **600**): open `with app.state.sessionmaker() as db:`,
  call `sync_insights(db, get_insights_connector(settings), registry, clock.now())`. Cancel on
  shutdown. **Gated off in tests** via `settings.insights_sync_enabled` (default False in the test
  settings; True in real runs) so `TestClient(app)` stays hermetic — tests call `sync_insights`
  directly with a fixed clock + stub.
- Config: `insights_sync_enabled: bool`, `insights_sync_interval_seconds: int = 600`,
  `insights_max_age_days: int = 30` added to `Settings`.

---

## 8. API + UI

- **`GET /engagement`** → `list[EngagementOut]` with `post_id, platform, metrics (dict), fetched_at`.
  (The old fixed `impressions/clicks/engagement` fields are gone; regenerate the OpenAPI→TS types.)
- Optional `GET /engagement/registry` (or embed in the response) so the web knows each platform's
  labels/order without hardcoding.
- **Dashboard** (`app/agent/engagement/page.tsx`, `EngagementChart.tsx`): render metric tiles from
  the platform registry; the chart plots each metric's **snapshots over `fetched_at`** (growth
  curve). An empty state when a post has no insights yet. No IG-specific metric names hardcoded in
  the component. A **"Refresh from Instagram"** button calls `POST /engagement/refresh` and reloads;
  a per-post "updated N min ago / ⚠ last refresh failed" line reads `PostInsightsSync`.

---

## 9. Setup step (yours)

Add **`instagram_business_manage_insights`** on the Meta app's Permissions page (it'll show
"Ready for testing" for your own account), then **regenerate the token** (same flow as before) and
update `INSTAGRAM_ACCESS_TOKEN` in `apps/api/.env`. Until then, the **stub** supplies metrics and the
basic `like_count`/`comments_count` still work with the current token.

---

## 10. Contracts

- **Contract 2:** token from env only; connector logs name, never the token; insights sync is the
  project's only other egress, confined to `graph.instagram.com`, real-only.
- **Contract 4:** stub insights + injected clock + sync disabled under tests → reproducible.
- **Contract 3:** the sync is **read-only** (no destructive actions) — no new audit surface needed;
  (optionally record a content-free sync run via the existing `record_run`/trace).
- **Contract 1:** unaffected (insights are about the agent's own published posts).

---

## 11. New acceptance criteria (AC58–AC61, provisional)

- **AC58** — Platform metric registry: `metrics_for(platform, media_type)` returns the correct IG
  metric set (feed vs reel); adding a platform needs no schema change. (api)
- **AC59** — Instagram insights connector (real) + deterministic stub; factory by env; `httpx`
  mocked in tests, no egress; permission/token errors typed, not fatal. (api)
- **AC60** — `sync_insights(db, connector, registry, now)` appends a snapshot per eligible post
  (external_id present, ≤30d), skips others, survives a per-post error — proven with a fixed clock +
  stub. (api)
- **AC61** — `GET /engagement` returns platform + metrics + fetched_at; the dashboard renders the
  platform's metric set + a growth trend from snapshots. (api + web + e2e)
- **AC62** — Sync state: every sync attempt upserts `PostInsightsSync` (ok/error + typed error); a
  failed fetch records the error and leaves the last-good snapshot intact. `POST /engagement/refresh`
  runs an on-demand sync for the agent's posts. (api)

Governance: version bump + change-log row on `/REQUIREMENTS.md` (user approval), proofs into
`requirements.manifest.yaml`, regenerate OpenAPI→TS types, `make verify` green.

---

## 12. Risks & open items

1. **Insights permission is the one external gate** — until `instagram_business_manage_insights` is
   added + token regenerated, only stub/basic metrics flow. Documented; non-blocking (stub).
2. **Dashboard rework** — moving from fixed columns to registry-driven tiles/chart is the biggest
   code surface; kept behind the registry so it's data-driven, not per-platform branches.
3. **Lifespan worker hermeticity** — must be gated off under `TestClient`; tests drive the pure core
   directly. (Same pattern noted for the publish dispatcher.)
4. **Metric name drift** — Meta renames/deprecates metrics (impressions→views). The registry is the
   single place to adjust; keep the mapping cited.
5. **Snapshot growth** — one row per post per 10 min for ≤30 days ≈ a few thousand rows/post max;
   fine at PoC scale. A retention trim is a future nicety, not now.

---

## 13. Spec self-review

- **Placeholders:** none; metric set + cadence (600s) + window (30d) + storage shape all concrete.
- **Consistency:** D1 (rich metrics) needs D2 (permission); §6 fallback (stub/basic) covers the gap
  until the permission lands — stated, not contradictory.
- **Scope:** one subsystem (engagement ingestion); Instagram-only with an explicit extensibility
  seam; dashboard rework is in-scope because the data shape changes. No unrelated refactor.
- **Ambiguity:** "snapshot per sync" (append, not upsert) and "period = refresh cadence, data is
  cumulative" are pinned explicitly.
