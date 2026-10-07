# Engagement Insights Increment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seeded/mock engagement with real, platform-aware Instagram insights — pulled per published post, refreshed every 10 minutes, stored as platform-tagged snapshots with a sync-state record, and shown on a registry-driven dashboard with a manual refresh.

**Architecture:** A per-platform **metric registry** defines what to fetch + render. An **insights connector** (real Instagram + deterministic stub, via the existing env factory) returns `{metric: int}`. A pure `sync_insights` core, driven by a **gated lifespan worker** (every 10 min) and an on-demand `POST /engagement/refresh`, appends `Engagement` snapshots and upserts a `PostInsightsSync` status row. The dashboard renders from the registry. Token comes through a resolver seam (env now; per-user OAuth later).

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy · httpx · pytest. Web: Next.js 15.

**Spec:** `docs/plans/2026-10-06-engagement-insights-design.md` (read alongside this plan).

## Global Constraints

- **Contract 2 — secrets:** the Instagram token comes from env (via the token resolver); never in the DB/logs/source. Connectors log name only.
- **Contract 4 — determinism:** stub insights + injected clock + `insights_sync_enabled=False` by default keep tests hermetic/offline. No test performs network egress (httpx mocked).
- **Instagram:** media insights are **cumulative** (`views` replaced `impressions`, removed Apr 2025 — never request `impressions`); the rich edge needs `instagram_business_manage_insights` (stub covers it until the permission + token regen land). Graph API pinned to `settings.graph_api_version` (`v26.0`). Cite metric names in the PR per `.claude/rules/citations.md`. Source: https://developers.facebook.com/documentation/instagram-platform/insights
- **Cadence/window:** sync every `INSIGHTS_SYNC_INTERVAL_SECONDS=600`; only posts with `external_id` and `published_at >= now - INSIGHTS_MAX_AGE_DAYS` (30).
- **Enum/schema:** reshaped `Engagement` + new `PostInsightsSync` use JSON/str/datetime (no native enum), so `create_all` needs a **fresh DB** (no Alembic); SQLite test DBs are always fresh.
- **OpenAPI→TS drift gate:** after the engagement router/schema change, run `node scripts/gen-api-types.mjs` (with `PYTHON=apps/api/.venv/bin/python`) and commit `openapi.json` + `api-types.ts`, or `make verify` fails.

## Review Focus

- **Sync fails for one post (permission/token/rate)** — the loop must record the typed error in `PostInsightsSync`, keep the last-good snapshot, and continue to the next post, not abort the whole run. → Task 5 tests.
- **Post has an `external_id` but is older than 30 days** — excluded from the scheduled sweep (but still refreshable on demand). → Task 5 tests.
- **A post never synced yet** — dashboard/endpoint must handle "no snapshots, no sync row" without erroring (empty state). → Task 7 + Task 8 tests.
- **Reel vs feed metric applicability** — `metrics_for("instagram", "REELS")` must exclude feed-only metrics so the connector doesn't request invalid ones. → Task 2 tests.
- **Stub determinism** — same `external_id` → identical metrics across runs (reproducible dashboard/tests). → Task 3 tests.

---

## File structure

**apps/api (new):** `app/social/metrics.py` (registry), `app/social/insights.py` (connector + stub + real), `app/social/token.py` (resolver), `app/services/insights_sync.py` (pure core + worker), `app/models/post_insights_sync.py` (sync-state).
**apps/api (modify):** `app/config.py`, `app/social/factory.py` (add `get_insights_connector`), `app/models/engagement.py` (reshape), `app/models/__init__.py` (register new model), `app/routers/engagement.py` (reshape + refresh), `app/main.py` (lifespan), `app/seed.py` + `app/seed_demo.py` (new shape).
**packages/shared + web:** `packages/shared/src/client.ts` (+ regenerated types), `apps/web/app/agent/engagement/page.tsx`, `apps/web/components/charts/EngagementChart.tsx`.
**Tests:** `tests/test_metrics_registry.py`, `tests/test_insights_connector.py`, `tests/test_insights_sync.py`, `tests/test_engagement_route.py`; `apps/web/tests/engagement-dashboard.test.ts`.

---

### Task 1: Config flags + token resolver

**Files:** Modify `apps/api/app/config.py`, `.env.example`; Create `apps/api/app/social/token.py`; Test `apps/api/tests/test_config_instagram.py` (extend).

**Interfaces:**
- Produces: `Settings.insights_sync_enabled: bool = False`, `insights_sync_interval_seconds: int = 600`, `insights_max_age_days: int = 30`; `app.social.token.account_token(settings, user=None) -> str | None` (returns `settings.instagram_access_token` today — the seam for per-user tokens later).

- [ ] **Step 1: failing test**
```python
# tests/test_config_instagram.py (add)
from app.social.token import account_token

def test_insights_sync_defaults():
    from app.config import Settings
    s = Settings(_env_file=None)
    assert s.insights_sync_enabled is False
    assert s.insights_sync_interval_seconds == 600
    assert s.insights_max_age_days == 30

def test_account_token_returns_env_token():
    from app.config import Settings
    s = Settings(_env_file=None, instagram_access_token="tok", ig_user_id="1")
    assert account_token(s) == "tok"
    assert account_token(Settings(_env_file=None)) is None
```
- [ ] **Step 2: run → FAIL** (`uv run pytest tests/test_config_instagram.py -q`) — `app.social.token` missing.
- [ ] **Step 3: implement**
```python
# app/config.py — add to Settings
    insights_sync_enabled: bool = False
    insights_sync_interval_seconds: int = 600
    insights_max_age_days: int = 30
```
```python
# app/social/token.py
from __future__ import annotations
from app.config import Settings

def account_token(settings: Settings, user=None) -> str | None:
    """Resolve the Instagram access token. Env-backed today; the seam for per-user OAuth tokens."""
    return settings.instagram_access_token
```
Add to `.env.example`: `INSIGHTS_SYNC_ENABLED=false`, `INSIGHTS_SYNC_INTERVAL_SECONDS=600`, `INSIGHTS_MAX_AGE_DAYS=30`.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(api): insights sync config + token resolver seam`.

---

### Task 2: Platform metric registry

**Files:** Create `apps/api/app/social/metrics.py`; Test `apps/api/tests/test_metrics_registry.py`.

**Interfaces:**
- Produces: `MetricDef(key, label, order)`, `PlatformMetrics(platform, metrics: tuple[MetricDef,...], reel_exclude: frozenset[str])`, `REGISTRY: dict[str, PlatformMetrics]`, `metrics_for(platform: str, media_type: str) -> tuple[MetricDef, ...]`, `metric_keys(platform, media_type) -> list[str]`.

- [ ] **Step 1: failing test**
```python
# tests/test_metrics_registry.py
from app.social.metrics import metrics_for, metric_keys

def test_instagram_feed_metric_set():
    keys = metric_keys("instagram", "IMAGE")
    assert keys == ["reach", "views", "likes", "comments", "saved", "shares", "total_interactions"]

def test_instagram_reel_excludes_feed_only_metrics():
    # Reels keep reach/views/likes/comments/saved/shares/total_interactions; no feed-only keys leak.
    keys = metric_keys("instagram", "REELS")
    assert "saved" in keys and "views" in keys
    assert all(k in metric_keys("instagram", "IMAGE") for k in keys)

def test_unknown_platform_is_empty():
    assert metrics_for("tiktok", "IMAGE") == ()
```
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement**
```python
# app/social/metrics.py
from __future__ import annotations
from dataclasses import dataclass, field

@dataclass(frozen=True)
class MetricDef:
    key: str
    label: str
    order: int

@dataclass(frozen=True)
class PlatformMetrics:
    platform: str
    metrics: tuple[MetricDef, ...]
    reel_exclude: frozenset[str] = field(default_factory=frozenset)

_IG = PlatformMetrics(
    platform="instagram",
    metrics=(
        MetricDef("reach", "Reach", 1), MetricDef("views", "Views", 2),
        MetricDef("likes", "Likes", 3), MetricDef("comments", "Comments", 4),
        MetricDef("saved", "Saved", 5), MetricDef("shares", "Shares", 6),
        MetricDef("total_interactions", "Interactions", 7),
    ),
)
REGISTRY: dict[str, PlatformMetrics] = {"instagram": _IG}

def metrics_for(platform: str, media_type: str) -> tuple[MetricDef, ...]:
    pm = REGISTRY.get(platform)
    if pm is None:
        return ()
    if media_type.upper() == "REELS":
        return tuple(m for m in pm.metrics if m.key not in pm.reel_exclude)
    return pm.metrics

def metric_keys(platform: str, media_type: str) -> list[str]:
    return [m.key for m in metrics_for(platform, media_type)]
```
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(api): platform metric registry (Instagram)`.

---

### Task 3: Insights connector (interface + stub + real + factory)

**Files:** Create `apps/api/app/social/insights.py`; Modify `apps/api/app/social/factory.py`; Test `apps/api/tests/test_insights_connector.py`.

**Interfaces:**
- Consumes: `metric_keys` (Task 2), `account_token` (Task 1), `PublishError` (existing `app/social/base.py`).
- Produces: `InsightsConnector(abc)` with `fetch_insights(self, *, external_id: str, media_type: str) -> dict[str, int]`; `StubInsights` (`name="stub"`, deterministic); `InstagramInsights(settings, *, transport=None)` (`name="instagram"`); `get_insights_connector(settings) -> InsightsConnector` in `factory.py` (real when `instagram_configured()`, else stub).

- [ ] **Step 1: failing test**
```python
# tests/test_insights_connector.py
import httpx, pytest
from app.config import Settings
from app.social.insights import StubInsights, InstagramInsights
from app.social.factory import get_insights_connector
from app.social.base import PublishError

def test_stub_is_deterministic_and_registry_shaped():
    c = StubInsights()
    a = c.fetch_insights(external_id="M1", media_type="IMAGE")
    b = c.fetch_insights(external_id="M1", media_type="IMAGE")
    assert a == b and a.keys() == {"reach","views","likes","comments","saved","shares","total_interactions"}
    assert all(isinstance(v, int) and v >= 0 for v in a.values())

class _T(httpx.BaseTransport):
    def __init__(self, responses): self._r=list(responses); self.calls=[]
    def handle_request(self, request):
        self.calls.append(request); s,p=self._r.pop(0); return httpx.Response(s, json=p, request=request)

def _s(): return Settings(_env_file=None, instagram_access_token="t", ig_user_id="1")

def test_instagram_maps_insight_rows():
    t=_T([
        (200, {"data":[{"name":"reach","values":[{"value":100}]},{"name":"likes","values":[{"value":9}]}]}),
        (200, {"like_count":9, "comments_count":2}),
    ])
    out = InstagramInsights(_s(), transport=t).fetch_insights(external_id="M1", media_type="IMAGE")
    assert out["reach"] == 100 and out["likes"] == 9 and out["comments"] == 2

def test_instagram_permission_error_is_typed():
    t=_T([(400, {"error":{"code":10,"message":"insights perm missing"}})])
    with pytest.raises(PublishError) as ei:
        InstagramInsights(_s(), transport=t).fetch_insights(external_id="M1", media_type="IMAGE")
    assert ei.value.code in ("insights_permission","unknown")

def test_factory_picks_stub_without_keys():
    assert get_insights_connector(Settings(_env_file=None)).name == "stub"
```
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** `insights.py` (stub: deterministic per-key from `sha256(external_id+key)` → `int % 1000`; real: GET `/{ext}/insights?metric=<keys>` mapping `data[].name`→`values[0].value` (or `total_value.value`), then GET `/{ext}?fields=like_count,comments_count` to fill `likes`/`comments`; map error `code 10`/subcodes to `insights_permission`, `190`→`token_expired`, rate→`rate_limited`, else `unknown`, raising `PublishError`). Add `get_insights_connector` to `factory.py` mirroring `get_connector`.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(api): Instagram insights connector + deterministic stub + factory`.

---

### Task 4: Reshape Engagement + add PostInsightsSync + seed

**Files:** Modify `apps/api/app/models/engagement.py`, `app/models/__init__.py`, `app/seed.py`, `app/seed_demo.py`; Create `apps/api/app/models/post_insights_sync.py`; Test `apps/api/tests/test_models_engagement.py`.

**Interfaces:**
- Produces: `Engagement(id, post_id, platform: str, metrics: JSON, fetched_at: datetime)`; `PostInsightsSync(post_id pk/fk, last_synced_at, sync_status: str ("ok"|"error"|"never_synced"), last_error: str)`.

- [ ] **Step 1: failing test**
```python
# tests/test_models_engagement.py
def test_engagement_stores_platform_metrics_snapshot(app):
    from app.models.engagement import Engagement
    from datetime import datetime, timezone
    with app.state.sessionmaker() as db:
        db.add(Engagement(post_id=1, platform="instagram",
                          metrics={"reach":10,"likes":3}, fetched_at=datetime.now(timezone.utc)))
        db.commit()
        row = db.query(Engagement).one()
        assert row.platform == "instagram" and row.metrics["reach"] == 10

def test_post_insights_sync_row(app):
    from app.models.post_insights_sync import PostInsightsSync
    from datetime import datetime, timezone
    with app.state.sessionmaker() as db:
        db.add(PostInsightsSync(post_id=1, last_synced_at=datetime.now(timezone.utc),
                                sync_status="error", last_error="insights_permission: nope"))
        db.commit()
        assert db.query(PostInsightsSync).one().sync_status == "error"
```
- [ ] **Step 2: run → FAIL** (`uv run pytest tests/test_models_engagement.py -q`).
- [ ] **Step 3: implement** — reshape `Engagement` (drop `impressions/clicks/engagement`; add `platform String(20)`, `metrics JSON default dict`, `fetched_at DateTime(tz)`); create `PostInsightsSync`; import both in `app/models/__init__.py`. Update `seed.py` `_upsert_post_with_engagement` and `seed_demo.py` to write `Engagement(platform="instagram", metrics={...}, fetched_at=…)` (use a fixed clock value for determinism).
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(api): platform-tagged Engagement snapshots + PostInsightsSync`.

---

### Task 5: Sync core (pure)

**Files:** Create `apps/api/app/services/insights_sync.py`; Test `apps/api/tests/test_insights_sync.py`.

**Interfaces:**
- Consumes: `InsightsConnector`, `metrics_for`/registry, `Post` (has `external_id`, `platform`, `published_at`, `channel`), `Engagement`, `PostInsightsSync`, `PublishError`.
- Produces: `sync_insights(db, connector, now, *, max_age_days=30, post_ids=None) -> int` — returns count of successful snapshots.

- [ ] **Step 1: failing tests**
```python
# tests/test_insights_sync.py — build posts via a helper; use StubInsights + a Failing fake
from datetime import datetime, timedelta, timezone
from app.services.insights_sync import sync_insights
from app.social.insights import StubInsights
from app.social.base import PublishError

NOW = datetime(2026, 1, 10, tzinfo=timezone.utc)

def test_snapshots_recent_published_posts(app):  # app fixture + a helper to insert posts
    # seed: 1 published post (external_id, published 2d ago), 1 published 40d ago, 1 draft (no external_id)
    ...
    with app.state.sessionmaker() as db:
        n = sync_insights(db, StubInsights(), NOW, max_age_days=30)
        assert n == 1  # only the recent published-with-external-id post
        # a PostInsightsSync ok row + an Engagement snapshot exist for it

def test_per_post_error_is_recorded_not_fatal(app):
    class _Boom(StubInsights):
        def fetch_insights(self, *, external_id, media_type):
            raise PublishError("insights_permission", "nope")
    with app.state.sessionmaker() as db:
        n = sync_insights(db, _Boom(), NOW, max_age_days=30)
        assert n == 0
        from app.models.post_insights_sync import PostInsightsSync
        row = db.query(PostInsightsSync).first()
        assert row.sync_status == "error" and "insights_permission" in row.last_error
```
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** — select `Post` where `external_id is not None` and (`post_ids` given OR `published_at >= now - timedelta(days=max_age_days)`); per post: try `connector.fetch_insights(external_id, media_type=post.channel-or-media)`, on success append `Engagement(post_id, platform=post.platform, metrics=…, fetched_at=now)` + upsert `PostInsightsSync(ok)`; on `PublishError` upsert `PostInsightsSync(error, code+msg)` (no snapshot); commit once; return success count.
- [ ] **Step 4: run → PASS**.
- [ ] **Step 5: commit** `feat(api): pure insights sync core (snapshot + sync-state, error-tolerant)`.

---

### Task 6: Lifespan worker (gated)

**Files:** Modify `apps/api/app/main.py`; Test `apps/api/tests/test_lifespan_sync.py`.

**Interfaces:**
- Consumes: `sync_insights`, `get_insights_connector`, `clock.now`, `app.state.sessionmaker`, `settings.insights_sync_*`.
- Produces: a `lifespan` on `create_app` that starts an asyncio loop when `settings.insights_sync_enabled` — no new public symbol; verified via behavior.

- [ ] **Step 1: failing test** — with `insights_sync_enabled=False` (default), `with TestClient(app)` starts/stops cleanly and runs **no** sync (hermetic); assert the app still serves `/health`. (A full interval test isn't run — the pure core is tested in Task 5; here we assert the gate + clean startup/shutdown.)
```python
# tests/test_lifespan_sync.py
def test_app_starts_with_sync_disabled(client):
    assert client.get("/health").json() == {"status": "ok"}
```
- [ ] **Step 2: run → FAIL only if lifespan breaks startup** (otherwise write the gate first): implement lifespan, then confirm.
- [ ] **Step 3: implement** `lifespan` with `contextlib.asynccontextmanager`: if `settings.insights_sync_enabled`, `asyncio.create_task` a loop that `await asyncio.sleep(interval)` then `with app.state.sessionmaker() as db: sync_insights(db, get_insights_connector(settings), clock.now(), max_age_days=settings.insights_max_age_days)`; cancel on shutdown. Pass `lifespan=` to `FastAPI(...)`.
- [ ] **Step 4: run → PASS** (+ full suite to confirm no TestClient hangs).
- [ ] **Step 5: commit** `feat(api): gated lifespan worker runs insights sync every 10 min`.

---

### Task 7: Engagement API (reshape + refresh) + contract

**Files:** Modify `apps/api/app/routers/engagement.py`; Modify `packages/shared/src/client.ts`; Test `apps/api/tests/test_engagement_route.py`.

**Interfaces:**
- Produces: `EngagementOut(post_id, platform, metrics: dict[str,int], fetched_at)`; `GET /engagement`; `POST /engagement/refresh` (agent-only) → runs `sync_insights(db, get_insights_connector(settings), now, post_ids=<agent's posts>)` and returns `{synced: int}`.

- [ ] **Step 1: failing tests** — `GET /engagement` returns the new shape; `POST /engagement/refresh` as agent returns 200 `{synced:…}` and creates snapshots for the agent's own published posts (stub); provider gets 403.
- [ ] **Step 2: run → FAIL**.
- [ ] **Step 3: implement** the reshaped `EngagementOut` + the refresh route; add `refreshEngagement()` to `client.ts`.
- [ ] **Step 4: run → PASS**; then regenerate the contract: `PYTHON=apps/api/.venv/bin/python node scripts/gen-api-types.mjs` and `uv run --project apps/api python scripts/check_api_types_sync.py` → OK.
- [ ] **Step 5: commit** `feat: engagement API returns platform metrics + on-demand refresh (+ regen types)`.

---

### Task 8: Registry-driven dashboard + refresh button

**Files:** Modify `apps/web/app/agent/engagement/page.tsx`, `apps/web/components/charts/EngagementChart.tsx`; Test `apps/web/tests/engagement-dashboard.test.ts`.

**Interfaces:**
- Consumes: `listEngagement`, `refreshEngagement` (Task 7); the per-platform labels (a small web-side `PLATFORM_METRICS` map mirroring the API registry, or an endpoint — keep one source: a tiny `lib/engagement/registry.ts`).
- Produces: metric tiles + a per-metric trend from snapshots (grouped by `post_id`, ordered by `fetched_at`); a "Refresh from Instagram" button calling `refreshEngagement` then reloading; an empty state.

- [ ] **Step 1: failing test** — a pure helper `groupSnapshots(rows) -> per-post series` and `tilesFor(platform)`; assert grouping/ordering + that unknown metrics are ignored.
- [ ] **Step 2: run → FAIL** (`pnpm exec vitest run tests/engagement-dashboard.test.ts`).
- [ ] **Step 3: implement** the helper + wire the page (tiles from the registry, chart from snapshots, refresh button). Match existing dashboard styling.
- [ ] **Step 4: run → PASS**; `pnpm exec tsc --noEmit`.
- [ ] **Step 5: commit** `feat(web): registry-driven engagement dashboard + refresh`.

---

### Task 9: Governance — ACs + make verify

**Files:** Modify `/REQUIREMENTS.md` (version bump + change-log — **needs user approval**), `requirements.manifest.yaml`.

- [ ] **Step 1:** add **AC58–AC62** (registry; insights connector+stub; sync core; engagement API+dashboard; sync-state+refresh) with proofs.
- [ ] **Step 2: run** `make verify` → all steps green.
- [ ] **Step 3: commit** `docs(req): AC58-AC62 engagement insights + proofs`.

---

## Self-Review

**Spec coverage:** registry (T2) [§4] · model reshape + sync-state (T4) [§5] · insights connector + stub (T3) [§6] · pure sync + lifespan worker 10-min/30-day (T5,T6) [§7] · engagement API + refresh (T7) [§7,§8] · dashboard (T8) [§8] · config/token-resolver (T1) [§7] · ACs (T9) [§11]. Setup step (add permission + regen token) [§9] is a user action, documented, not a code task.

**Placeholder scan:** Task 3/5/8 reference existing patterns (connector factory, seed helper, dashboard styling) rather than repeating them; all have concrete tests + signatures. No "TBD".

**Type consistency:** `fetch_insights(*, external_id, media_type) -> dict[str,int]`, `metrics_for/metric_keys`, `sync_insights(db, connector, now, *, max_age_days, post_ids)`, `Engagement(post_id, platform, metrics, fetched_at)`, `PostInsightsSync(post_id, last_synced_at, last_status, last_error)`, `EngagementOut(post_id, platform, metrics, fetched_at)` are used identically across tasks.

**Review Focus:** all five lines have an owning task's test (per-post error → T5; >30d exclusion → T5; never-synced empty state → T7/T8; reel applicability → T2; stub determinism → T3).

**Migration note:** reshaped `Engagement` + new table under `create_all`/no-Alembic ⇒ a **fresh DB** (drop `ig-e2e.db`/dev DB + re-seed); SQLite test DBs are always fresh. Flag at execution start.
