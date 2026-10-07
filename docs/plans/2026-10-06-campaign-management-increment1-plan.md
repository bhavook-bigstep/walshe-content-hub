# Campaign Management — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Campaign organising layer — an agent can create a campaign, schedule Studio creatives into it as dated/timed Instagram posts (image captured at schedule time), edit/reschedule them before review, and see them laid out on a month calendar. Nothing auto-publishes yet.

**Architecture:** A new `Campaign` ORM entity (agent-owned, platform-agnostic) plus a nullable `Post.campaign_id` and the frozen post-status vocabulary. A new agent-only `/campaigns` router does CRUD + schedule-into-campaign (multipart capture-at-schedule, reusing the Instagram JPEG validation and the object-storage seam) + edit/reschedule. The web app gets an `app/agent/campaigns/` area: a list + create form, a campaign detail page with a month-grid calendar built from native `Date` (no date lib exists), and a schedule-a-post form that renders the creative to JPEG exactly as the Studio's `ExportMenu` does. The schema **does** change (a new `campaigns` table + `Post.campaign_id`); this repo just has no migration tool — it builds tables with `Base.metadata.create_all()` and registers models in `app/models/__init__.py`, so fresh DBs pick the change up and existing dev DBs are reset.

**Tech Stack:** FastAPI + SQLAlchemy (SQLite dev/tests, Postgres/MinIO in prod), Pydantic v2; Next.js 15 + React 19 + TypeScript + Tailwind + Fabric.js; shared typed client in `packages/shared` generated from the API's OpenAPI; pytest / Vitest / Playwright.

**Spec:** `docs/plans/2026-10-06-campaign-management-design.md` (frozen). This plan implements **Increment 1** (design §9); Increments 2–3 (approval + dispatcher; analytics) are out of scope here.

## Global Constraints

- **Schema evolution without a migration tool.** This repo has no Alembic/migrations; `Base.metadata.create_all()` (`app/db.py:34`, `app/main.py:105`, and each test) builds tables on a fresh DB. Inc 1 **does change the schema** (new `campaigns` table + `Post.campaign_id`). `create_all` only creates *missing tables* — it does not alter an existing one — so existing dev/test DBs must be reset (`rm` the sqlite file + reseed), as prior increments did. A new model must be imported in `app/models/__init__.py` or its table is never created. (A conventional Postgres prod DB would need a real migration for these changes; that is out of scope for the PoC.)
- **`PostStatus` is `native_enum=False`** (a plain string column, `app/models/post.py`), so adding enum values is a no-op.
- **Inc 1 adds to `Post` only `campaign_id`** plus the status vocabulary. The approval/publish columns (`approved_by`, `reviewed_at`, `review_note`, `publish_container_id`, `publish_started_at`, `publish_attempts`) are **Increment 2** — do not add them here.
- **Campaign status is `active` | `completed` only** (design §3). Created `active`; no draft/activation.
- **Agent-scoped, owner-checked.** Every `/campaigns` route uses `require_role(Role.tourism_agent)` and resolves the campaign via an owner check that returns **404** (not 403) for a non-owner — mirror `_owned_composition` (`app/routers/social.py:95-99`).
- **Time only via `Depends(clock.now)`** (`app/clock.py`); never call `datetime.now()`/`utcnow()` in logic. `scheduled_at` is **stored and compared in UTC**; campaign-window validation uses the **submitted offset's local date** (design §4.1).
- **Capture-at-schedule reuses the IG validation verbatim:** JPEG magic `data[:3] == b"\xff\xd8\xff"`, `_MAX_BYTES = 8 * 1024 * 1024`, `_MAX_CAPTION = 2200` (`app/routers/instagram.py:30-31,62-64`). Persist bytes via the storage seam `storage.put_object(key, data, "image/jpeg")` (`app/storage/minio_client.py:17`); set `media_object_key`.
- **Audit every stateful action** via `audit.record(db, actor_id=user.id, action=..., target_type="post"|"campaign", target_id=...)` (Contract 3).
- **Hermetic tests:** `Settings(_env_file=None)` (already in the `settings` fixture), synthetic fixtures, fixed clock via `app.dependency_overrides[clock.now]`; ~90% on changed lines, risk paths first.
- **Web:** no date library is installed — build the calendar from native `Date`/`Intl`. Use `datetime-local` inputs + `new Date(x).toISOString()` to send and `.toLocaleString()` to display, as `app/agent/social/page.tsx` does. Shared-client methods are thin pass-throughs through `send()`/`json()` with `FormData` passed straight as `body` (no `Content-Type`).
- **After endpoints exist, regenerate the OpenAPI types** (`pnpm gen:api-types` from repo root) so `packages/shared` carries the new schemas; the `make verify` `api-types-sync` gate enforces this.
- **Captured media is immutable for publishing.** Inc 1 may replace `media_object_key` while a post is editable (`draft`/`pending_approval`/`rejected`); once Inc 2 introduces `approved`/`publishing`/`published`, media replacement is blocked by the same editable-state rule (`PATCH` → 409). This makes the future publish contract explicit: what Inc 2 publishes is exactly what was captured and last reviewed.
- **Commits per task**, message ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Never push.** No new `/REQUIREMENTS.md` ACs in this increment (governance is a separate, user-approved step).

## Review Focus

Input classes the spec implies that a task's happy-path tests can miss — each is pinned to a test in the owning task:

1. **Non-UTC offset at the window boundary** — a `scheduled_at` like `2026-08-15T23:30:00+05:30` must validate against `[starts_on, ends_on]` by its **local** date (15 Aug), not the UTC date (15 Aug 18:00Z — same here, but `2026-08-16T02:00:00+05:30` is 15 Aug 20:30Z and must count as **16 Aug**), and store as UTC. → Task 3 (`within_campaign_window`) + Task 5.
2. **Cross-agent access** — agent B must not read agent A's campaign, schedule into it, or edit its posts; all return **404**, never a leak or a 403 that confirms existence. → Tasks 4, 5, 6.
3. **Bad media / invalid change** — non-JPEG or `> 8 MB` → **422** before any row or storage object is written. This holds for **both** `POST` (validate before `db.add`) **and** `PATCH` (validate caption + JPEG bytes + schedule window *before* uploading the replacement object — otherwise an invalid schedule leaves an orphaned object). Never a 500 or a stored bad asset. → Tasks 5, 6.
4. **Empty collections** — an agent with no campaigns → `[]`; a campaign with no posts → `posts: []`; never an error. → Task 4.
5. **Edit on a non-editable status** — `PATCH` on a post not in `{draft, pending_approval, rejected}` → **409**, never a silent mutation. → Task 6.

---

## File Structure

**Create (API):**
- `apps/api/app/models/campaign.py` — `Campaign` + `CampaignStatus`.
- `apps/api/app/schemas/campaign.py` — request/response models.
- `apps/api/app/services/campaign_schedule.py` — pure `within_campaign_window`.
- `apps/api/app/routers/campaigns.py` — the `/campaigns` router.
- `apps/api/tests/test_campaign_model.py`, `test_campaign_schedule.py`, `test_campaigns_routes.py`, `test_campaign_posts.py`.

**Modify (API):**
- `apps/api/app/models/post.py` — add `campaign_id` + status values.
- `apps/api/app/models/__init__.py` — register `Campaign`.
- `apps/api/app/main.py` — `include_router(campaigns.router)`.

**Create (web):**
- `apps/web/lib/campaigns/calendar.ts` (+ `calendar.test.ts`) — pure calendar helpers.
- `apps/web/lib/campaigns/form.ts` (+ `form.test.ts`) — `buildCampaignPostForm`.
- `apps/web/app/agent/campaigns/page.tsx` — list + create.
- `apps/web/app/agent/campaigns/[id]/page.tsx` — detail + calendar + schedule form.
- `apps/web/e2e/campaigns-smoke.spec.ts`.

**Modify (web):**
- `packages/shared/src/client.ts` — campaign client methods + types; regenerate `src/api-types.ts` + `openapi.json`.
- `apps/web/components/shell/AppShell.tsx` — nav entry, icon, crumb label.
- `apps/web/app/agent/page.tsx` — `QUICK_LINKS` entry.

---

## Task 1: `Campaign` model + registration

**Files:**
- Create: `apps/api/app/models/campaign.py`
- Modify: `apps/api/app/models/__init__.py`
- Test: `apps/api/tests/test_campaign_model.py`

**Interfaces:**
- Produces: `Campaign` (ORM) with `id, agent_id, name, destination, starts_on, ends_on, status, created_at`; `CampaignStatus` (`active`/`completed`).

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_campaign_model.py
from datetime import date, datetime, timezone

from app.db import create_all, make_engine, make_sessionmaker
from app.models.campaign import Campaign, CampaignStatus


def test_campaign_roundtrips_with_active_default(tmp_path):
    engine = make_engine(f"sqlite+pysqlite:///{tmp_path}/c.db")
    create_all(engine)
    with make_sessionmaker(engine)() as db:
        c = Campaign(
            agent_id=1, name="3N/4D Australia", destination="Australia",
            starts_on=date(2026, 8, 1), ends_on=date(2026, 8, 31),
            created_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        )
        db.add(c); db.commit(); db.refresh(c)
        assert c.id is not None
        assert c.status == CampaignStatus.active
        assert c.destination == "Australia"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_model.py -q`
Expected: FAIL — `ModuleNotFoundError: app.models.campaign`.

- [ ] **Step 3: Create the model**

```python
# apps/api/app/models/campaign.py
"""Campaign model — an agent-owned, platform-agnostic container of scheduled posts (design §3)."""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CampaignStatus(str, enum.Enum):
    active = "active"
    completed = "completed"


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    status: Mapped[CampaignStatus] = mapped_column(
        Enum(CampaignStatus, native_enum=False), default=CampaignStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
```

- [ ] **Step 4: Register the model so `create_all` builds the table**

In `apps/api/app/models/__init__.py`, add the import next to the others and extend `__all__`:

```python
from app.models.campaign import Campaign, CampaignStatus
```
```python
    "Campaign",
    "CampaignStatus",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_model.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/models/campaign.py apps/api/app/models/__init__.py apps/api/tests/test_campaign_model.py
git commit -m "feat(api): Campaign model (agent-owned, active/completed)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `Post.campaign_id` + status vocabulary

**Files:**
- Modify: `apps/api/app/models/post.py`
- Test: `apps/api/tests/test_campaign_model.py` (add cases)

**Interfaces:**
- Produces: `Post.campaign_id: int | None`; `PostStatus` gains `draft, pending_approval, approved, publishing, rejected, cancelled`.

- [ ] **Step 1: Write the failing test** (append)

```python
# apps/api/tests/test_campaign_model.py (append)
from app.models.post import Post, PostStatus


def test_post_campaign_id_optional_and_new_statuses(tmp_path):
    engine = make_engine(f"sqlite+pysqlite:///{tmp_path}/p.db")
    create_all(engine)
    with make_sessionmaker(engine)() as db:
        legacy = Post(composition_id=1, channel="instagram")   # campaign_id stays None
        linked = Post(composition_id=1, channel="instagram", campaign_id=7,
                      status=PostStatus.pending_approval)
        db.add_all([legacy, linked]); db.commit()
        assert legacy.campaign_id is None
        assert linked.campaign_id == 7
        assert PostStatus.pending_approval.value == "pending_approval"
        assert {"draft", "approved", "publishing", "rejected", "cancelled"} <= {
            s.value for s in PostStatus
        }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_model.py::test_post_campaign_id_optional_and_new_statuses -q`
Expected: FAIL — `AttributeError: campaign_id` / missing enum members.

- [ ] **Step 3: Extend the model**

In `apps/api/app/models/post.py`, add the new values to `PostStatus`:

```python
class PostStatus(str, enum.Enum):
    scheduled = "scheduled"
    published = "published"
    failed = "failed"
    # Campaign lifecycle (design §3). Inc 1 uses draft/pending_approval; the rest are
    # declared now (the frozen state machine's vocabulary) and exercised in Inc 2.
    draft = "draft"
    pending_approval = "pending_approval"
    approved = "approved"
    publishing = "publishing"
    rejected = "rejected"
    cancelled = "cancelled"
```

Add the column (after `composition_id`), importing `ForeignKey` (already imported):

```python
    campaign_id: Mapped[int | None] = mapped_column(
        ForeignKey("campaigns.id"), nullable=True
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_model.py -q`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/models/post.py apps/api/tests/test_campaign_model.py
git commit -m "feat(api): Post.campaign_id + campaign status vocabulary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pure campaign-window validation

**Files:**
- Create: `apps/api/app/services/campaign_schedule.py`
- Test: `apps/api/tests/test_campaign_schedule.py`

**Interfaces:**
- Produces: `within_campaign_window(scheduled_at: datetime, starts_on: date, ends_on: date) -> bool` — uses the submitted datetime's **own offset** local date (Review Focus #1).

- [ ] **Step 1: Write the failing test**

```python
# apps/api/tests/test_campaign_schedule.py
from datetime import date, datetime, timedelta, timezone

from app.services.campaign_schedule import within_campaign_window

START, END = date(2026, 8, 1), date(2026, 8, 31)
IST = timezone(timedelta(hours=5, minutes=30))


def test_in_window_inclusive_boundaries():
    assert within_campaign_window(datetime(2026, 8, 1, 9, tzinfo=timezone.utc), START, END)
    assert within_campaign_window(datetime(2026, 8, 31, 23, tzinfo=timezone.utc), START, END)


def test_before_and_after_window():
    assert not within_campaign_window(datetime(2026, 7, 31, 9, tzinfo=timezone.utc), START, END)
    assert not within_campaign_window(datetime(2026, 9, 1, 9, tzinfo=timezone.utc), START, END)


def test_local_date_from_submitted_offset_not_utc():
    # 2026-08-16 02:00 +05:30 == 2026-08-15 20:30Z. By LOCAL date it is 16 Aug (in window).
    aware = datetime(2026, 8, 16, 2, 0, tzinfo=IST)
    assert within_campaign_window(aware, START, END)
    # 2026-09-01 01:00 +05:30 == 2026-08-31 19:30Z, but LOCAL date is 1 Sep (out of window).
    aware_out = datetime(2026, 9, 1, 1, 0, tzinfo=IST)
    assert not within_campaign_window(aware_out, START, END)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_schedule.py -q`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```python
# apps/api/app/services/campaign_schedule.py
"""Pure scheduling rules for campaign posts (design §4.1). No I/O, no clock reads."""

from __future__ import annotations

from datetime import date, datetime


def within_campaign_window(scheduled_at: datetime, starts_on: date, ends_on: date) -> bool:
    """True iff the post's LOCAL calendar date (in the datetime's own offset) is in [start, end].

    The caller passes an offset-aware datetime; ``.date()`` yields the date in that submitted
    offset — never the server timezone — which is what the campaign window is checked against.
    """
    local_date = scheduled_at.date()
    return starts_on <= local_date <= ends_on
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_schedule.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/services/campaign_schedule.py apps/api/tests/test_campaign_schedule.py
git commit -m "feat(api): campaign-window validation by submitted offset local date

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Campaign schemas + CRUD routes (create / list / detail) + router registration

**Files:**
- Create: `apps/api/app/schemas/campaign.py`, `apps/api/app/routers/campaigns.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_campaigns_routes.py`

**Interfaces:**
- Consumes: `get_db`, `get_settings`, `require_role` (`app/deps.py`), `clock.now`, `audit.record`.
- Produces routes: `POST /campaigns` (201), `GET /campaigns`, `GET /campaigns/{id}`. Schemas: `CampaignCreate`, `CampaignOut` (`+post_count`), `CampaignPostOut`, `CampaignDetailOut` (`+posts`). Router helpers reused by Tasks 5–6: `_agent_only`, `_owned_campaign(db, id, user)`, `get_storage`, `_campaign_out(c, post_count)`.

- [ ] **Step 1a: Add a real second-agent fixture to `conftest.py`** (the seeded fixtures only create one agent, so isolation can't be tested without a genuine second agent — used here and in Tasks 5–6)

```python
# apps/api/tests/conftest.py (append)
def login_headers(client: TestClient, email: str, password: str) -> dict[str, str]:
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture
def second_agent_headers(client: TestClient) -> dict[str, str]:
    """A genuinely different tourism agent (agent2@test.local), for cross-agent isolation tests."""
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        if not db.query(User).filter_by(email="agent2@test.local").first():
            db.add(User(email="agent2@test.local", password_hash=hash_password("test-pass-a2"),
                        role=Role.tourism_agent, tenant_id=1, approved=True))
            db.commit()
    return login_headers(client, "agent2@test.local", "test-pass-a2")
```

- [ ] **Step 1b: Write the failing tests**

```python
# apps/api/tests/test_campaigns_routes.py
from app.models.user import Role
from tests.conftest import auth_header


def _create(client, headers, **over):
    body = {"name": "Australia Aug", "destination": "Australia",
            "starts_on": "2026-08-01", "ends_on": "2026-08-31"}
    body.update(over)
    return client.post("/campaigns", json=body, headers=headers)


def test_create_and_list_scoped_to_agent(client):
    a = auth_header(client, Role.tourism_agent)
    r = _create(client, a)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "active" and r.json()["post_count"] == 0
    lst = client.get("/campaigns", headers=a).json()
    assert len(lst) == 1 and lst[0]["name"] == "Australia Aug"


def test_second_agent_cannot_see_or_read_first_agents_campaigns(client, second_agent_headers):
    a = auth_header(client, Role.tourism_agent)
    cid = _create(client, a).json()["id"]
    # a genuinely different agent (seeded by the `second_agent_headers` fixture):
    assert client.get("/campaigns", headers=second_agent_headers).json() == []  # Review Focus #4
    assert client.get(f"/campaigns/{cid}",
                      headers=second_agent_headers).status_code == 404           # Review Focus #2


def test_detail_includes_posts_empty_and_non_owner_404(client):
    a = auth_header(client, Role.tourism_agent)
    cid = _create(client, a).json()["id"]
    detail = client.get(f"/campaigns/{cid}", headers=a)
    assert detail.status_code == 200 and detail.json()["posts"] == []
    # a non-agent (provider) is 403 by role; a different id is 404
    assert client.get("/campaigns/99999", headers=a).status_code == 404
    assert client.get(f"/campaigns/{cid}",
                      headers=auth_header(client, Role.content_provider)).status_code == 403


def test_ends_before_start_is_422(client):
    a = auth_header(client, Role.tourism_agent)
    assert _create(client, a, ends_on="2026-07-01").status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaigns_routes.py -q`
Expected: FAIL — 404 on `/campaigns` (router absent).

- [ ] **Step 3: Write the schemas**

```python
# apps/api/app/schemas/campaign.py
"""Campaign request/response models (design §3, §7)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models.post import PostStatus


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    destination: str | None = Field(default=None, max_length=120)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def _window_ordered(self) -> "CampaignCreate":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class CampaignOut(BaseModel):
    id: int
    name: str
    destination: str | None
    starts_on: date
    ends_on: date
    status: str
    created_at: datetime
    post_count: int = 0
    model_config = {"from_attributes": True}


class CampaignPostOut(BaseModel):
    id: int
    campaign_id: int | None
    composition_id: int
    platform: str
    caption: str
    status: PostStatus
    scheduled_at: datetime | None
    media_object_key: str | None
    model_config = {"from_attributes": True}


class CampaignDetailOut(CampaignOut):
    posts: list[CampaignPostOut] = Field(default_factory=list)
```

- [ ] **Step 4: Write the router (CRUD portion)**

```python
# apps/api/app/routers/campaigns.py
"""Campaign routes (design §7) — agent-owned; scheduling captures the creative at schedule time."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, clock
from app.deps import get_db, require_role
from app.models.campaign import Campaign, CampaignStatus
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.schemas.campaign import (
    CampaignCreate,
    CampaignDetailOut,
    CampaignOut,
    CampaignPostOut,
)
from app.services.campaign_schedule import within_campaign_window
from app.storage.minio_client import Storage

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

_agent_only = require_role(Role.tourism_agent)
_MAX_BYTES = 8 * 1024 * 1024  # Instagram image limit (mirrors app/routers/instagram.py)
_MAX_CAPTION = 2200


def get_storage(request: Request) -> Storage:  # mirrors app/routers/assets.py:36-37
    return request.app.state.storage


def _owned_campaign(db: Session, campaign_id: int, user: User) -> Campaign:
    c = db.get(Campaign, campaign_id)
    if c is None or c.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return c


def _campaign_out(c: Campaign, post_count: int) -> CampaignOut:
    return CampaignOut(
        id=c.id, name=c.name, destination=c.destination, starts_on=c.starts_on,
        ends_on=c.ends_on, status=c.status.value, created_at=c.created_at, post_count=post_count,
    )


@router.post("", response_model=CampaignOut, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: CampaignCreate,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    now: datetime = Depends(clock.now),
) -> CampaignOut:
    c = Campaign(
        agent_id=user.id, name=body.name, destination=body.destination,
        starts_on=body.starts_on, ends_on=body.ends_on,
        status=CampaignStatus.active, created_at=now,
    )
    db.add(c)
    db.flush()
    audit.record(db, actor_id=user.id, action="create", target_type="campaign", target_id=c.id)
    db.commit()
    db.refresh(c)
    return _campaign_out(c, 0)


@router.get("", response_model=list[CampaignOut])
def list_campaigns(
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> list[CampaignOut]:
    campaigns = db.scalars(
        select(Campaign).where(Campaign.agent_id == user.id).order_by(Campaign.id.desc())
    ).all()
    if not campaigns:
        return []
    counts = dict(
        db.execute(
            select(Post.campaign_id, func.count())
            .where(Post.campaign_id.in_([c.id for c in campaigns]))
            .group_by(Post.campaign_id)
        ).all()
    )
    return [_campaign_out(c, counts.get(c.id, 0)) for c in campaigns]


@router.get("/{campaign_id}", response_model=CampaignDetailOut)
def get_campaign(
    campaign_id: int,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
) -> CampaignDetailOut:
    c = _owned_campaign(db, campaign_id, user)
    posts = db.scalars(
        select(Post).where(Post.campaign_id == c.id).order_by(Post.scheduled_at, Post.id)
    ).all()
    return CampaignDetailOut(
        **_campaign_out(c, len(posts)).model_dump(),
        posts=[CampaignPostOut.model_validate(p) for p in posts],
    )
```

- [ ] **Step 5: Register the router**

In `apps/api/app/main.py`, add after `app.include_router(instagram.router)` (line ~136) and the matching import at the top (`from app.routers import ... campaigns ...`):

```python
    app.include_router(campaigns.router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaigns_routes.py -q`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/app/schemas/campaign.py apps/api/app/routers/campaigns.py apps/api/app/main.py apps/api/tests/test_campaigns_routes.py
git commit -m "feat(api): campaign CRUD routes (create/list/detail), agent-scoped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Schedule a composition into a campaign (capture-at-schedule)

**Files:**
- Modify: `apps/api/app/routers/campaigns.py`
- Test: `apps/api/tests/test_campaign_posts.py`

**Interfaces:**
- Consumes: `_owned_campaign`, `get_storage`, `within_campaign_window`, IG validation constants (Task 4).
- Produces: `POST /campaigns/{id}/posts` (multipart: `composition_id`, `caption`, `scheduled_at?`, `image`) → `CampaignPostOut` (201). Adds shared module helpers `_validate_caption(caption)`, `_parse_scheduled_at(raw) -> datetime` (rejects naive), and `_read_jpeg(image) -> bytes` — reused by Task 6.

- [ ] **Step 1: Write the failing tests**

```python
# apps/api/tests/test_campaign_posts.py
import io

from app.models.composition import Composition
from app.models.user import Role, User
from tests.conftest import auth_header

JPEG = b"\xff\xd8\xff" + b"\x00" * 64  # minimal "JPEG" (magic bytes + filler)


def _agent_id(client) -> int:
    # the seeded agent is agent@test.local; look it up via the app session
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        return db.query(User).filter_by(email="agent@test.local").one().id


def _make_composition(client) -> int:
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        comp = Composition(agent_id=_agent_id(client), format="social", item_ids=[])
        db.add(comp); db.commit(); db.refresh(comp)
        return comp.id


def _campaign(client, headers) -> int:
    return client.post("/campaigns", json={
        "name": "Aus", "starts_on": "2026-08-01", "ends_on": "2026-08-31",
    }, headers=headers).json()["id"]


def _schedule(client, headers, cid, comp_id, *, scheduled_at="2026-08-15T15:00:00+05:30",
              image=JPEG):
    data = {"composition_id": str(comp_id), "caption": "Hello"}
    if scheduled_at is not None:
        data["scheduled_at"] = scheduled_at
    return client.post(f"/campaigns/{cid}/posts", data=data,
                       files={"image": ("post.jpg", io.BytesIO(image), "image/jpeg")},
                       headers=headers)


def test_schedule_lands_pending_approval_with_media(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    r = _schedule(client, a, cid, comp)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending_approval"
    assert body["campaign_id"] == cid and body["media_object_key"]


def test_schedule_without_time_is_draft(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    r = _schedule(client, a, cid, comp, scheduled_at=None)
    assert r.status_code == 201 and r.json()["status"] == "draft"
    assert r.json()["scheduled_at"] is None


def test_schedule_outside_window_422(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    r = _schedule(client, a, cid, comp, scheduled_at="2026-09-01T10:00:00+00:00")
    assert r.status_code == 422


def test_schedule_non_jpeg_and_oversize_422(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    assert _schedule(client, a, cid, comp, image=b"\x89PNG\r\n").status_code == 422
    assert _schedule(client, a, cid, comp, image=b"\xff\xd8\xff" + b"\x00" * (8 * 1024 * 1024 + 1)
                     ).status_code == 422


def test_schedule_foreign_composition_404(client):
    a = auth_header(client, Role.tourism_agent)
    cid = _campaign(client, a)
    r = _schedule(client, a, cid, comp_id=99999)
    assert r.status_code == 404


def test_schedule_naive_datetime_422(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    r = _schedule(client, a, cid, comp, scheduled_at="2026-08-15T15:00:00")  # no offset
    assert r.status_code == 422


def test_second_agent_cannot_schedule_into_foreign_campaign(client, second_agent_headers):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)  # both owned by agent A
    r = _schedule(client, second_agent_headers, cid, comp)       # agent B
    assert r.status_code == 404  # Review Focus #2 (404 before the composition is even checked)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_posts.py -q`
Expected: FAIL — 405/404 (route absent).

- [ ] **Step 3: Implement the route** (append to `campaigns.py`)

```python
# Shared validation helpers — POST and PATCH call the SAME ones so the two endpoints can never
# diverge (e.g. accept on POST what PATCH rejects). All raise 422 and write nothing.
def _validate_caption(caption: str) -> None:
    if len(caption) > _MAX_CAPTION:
        raise HTTPException(422, f"Caption exceeds Instagram's {_MAX_CAPTION}-character limit")


def _parse_scheduled_at(raw: str) -> datetime:
    """Parse an ISO-8601 datetime and REQUIRE an explicit timezone offset (design §4.1).

    A naive value is rejected (422), not silently assumed UTC — that keeps the UTC-storage contract
    hard to misuse. ``.date()`` on the result is the submitted offset's LOCAL date (what the campaign
    window is checked against); ``.astimezone(timezone.utc)`` is what we store.
    """
    try:
        dt = datetime.fromisoformat(raw)  # Python 3.12 parses offsets and a trailing 'Z'
    except ValueError as err:
        raise HTTPException(422, "scheduled_at must be an ISO-8601 datetime") from err
    if dt.tzinfo is None:
        raise HTTPException(422, "scheduled_at must include a timezone offset")
    return dt


def _read_jpeg(image: UploadFile) -> bytes:
    data = image.file.read()
    if data[:3] != b"\xff\xd8\xff":
        raise HTTPException(422, "Image must be a JPEG (Instagram does not accept PNG)")
    if len(data) > _MAX_BYTES:
        raise HTTPException(422, "Image exceeds Instagram's 8 MB limit")
    return data


@router.post("/{campaign_id}/posts", response_model=CampaignPostOut,
             status_code=status.HTTP_201_CREATED)
def schedule_post(
    campaign_id: int,
    composition_id: int = Form(...),
    caption: str = Form(""),
    scheduled_at: str | None = Form(None),
    image: UploadFile = File(...),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> CampaignPostOut:
    campaign = _owned_campaign(db, campaign_id, user)
    comp = db.get(Composition, composition_id)
    if comp is None or comp.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    _validate_caption(caption)
    data = _read_jpeg(image)  # validate before writing anything

    sched_utc: datetime | None = None
    post_status = PostStatus.draft
    if scheduled_at:
        dt = _parse_scheduled_at(scheduled_at)
        if not within_campaign_window(dt, campaign.starts_on, campaign.ends_on):
            raise HTTPException(422, "scheduled_at is outside the campaign window")
        sched_utc = dt.astimezone(timezone.utc)
        post_status = PostStatus.pending_approval

    post = Post(
        campaign_id=campaign.id, composition_id=comp.id, channel="instagram",
        platform="instagram", caption=caption, status=post_status, scheduled_at=sched_utc,
    )
    db.add(post)
    db.flush()  # assign post.id for the storage key
    key = f"campaign-posts/{post.id}/{int(now.timestamp())}.jpg"
    storage.put_object(key, data, "image/jpeg")  # captured now; Inc 2 publishes from this
    post.media_object_key = key
    audit.record(db, actor_id=user.id, action="schedule", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return CampaignPostOut.model_validate(post)
```

> **Storage is not transactionally coupled to the DB commit.** The object is `put_object`-ed before `db.commit()`; if the commit then fails, the object is orphaned. For Inc 1 this is accepted — validation runs *before* any write (so bad input never uploads), and orphan cleanup is out of scope (same contract as `PATCH`, Task 6). What we guarantee is the ordering: **validate everything, then write.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_posts.py -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/routers/campaigns.py apps/api/tests/test_campaign_posts.py
git commit -m "feat(api): schedule a composition into a campaign (capture-at-schedule)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Edit / reschedule a campaign post (`PATCH`)

**Files:**
- Modify: `apps/api/app/routers/campaigns.py`
- Test: `apps/api/tests/test_campaign_posts.py` (add cases)

**Interfaces:**
- Produces: `PATCH /campaigns/{id}/posts/{post_id}` (multipart: optional `caption`, `scheduled_at`, `unschedule: bool`, `image`) → `CampaignPostOut`. Allowed statuses `{draft, pending_approval, rejected}` (409 otherwise). Multipart can't carry JSON `null`, so unscheduling uses an explicit `unschedule=true` flag (§7.1).

- [ ] **Step 1: Write the failing tests** (append)

```python
# apps/api/tests/test_campaign_posts.py (append)
def _post_id(client, a, cid, comp):
    return _schedule(client, a, cid, comp).json()["id"]


def test_patch_caption_only_preserves_media_and_schedule(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    before = client.get(f"/campaigns/{cid}", headers=a).json()["posts"][0]
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"caption": "Updated"}, headers=a)
    assert r.status_code == 200
    body = r.json()
    assert body["caption"] == "Updated"
    assert body["media_object_key"] == before["media_object_key"]
    assert body["scheduled_at"] == before["scheduled_at"]
    assert body["status"] == "pending_approval"


def test_patch_reschedule_validates_window(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    ok = client.patch(f"/campaigns/{cid}/posts/{pid}",
                      data={"scheduled_at": "2026-08-20T09:00:00+00:00"}, headers=a)
    assert ok.status_code == 200 and ok.json()["status"] == "pending_approval"
    bad = client.patch(f"/campaigns/{cid}/posts/{pid}",
                       data={"scheduled_at": "2026-09-09T09:00:00+00:00"}, headers=a)
    assert bad.status_code == 422


def test_patch_unschedule_moves_to_draft(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"unschedule": "true"}, headers=a)
    assert r.status_code == 200 and r.json()["status"] == "draft"
    assert r.json()["scheduled_at"] is None


def test_patch_blocked_on_non_editable_status(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    # force a non-editable status directly in the DB (Inc 1 has no approve action)
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        from app.models.post import Post, PostStatus
        p = db.get(Post, pid); p.status = PostStatus.published; db.commit()
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"caption": "x"}, headers=a)
    assert r.status_code == 409


def test_patch_invalid_schedule_with_image_writes_nothing(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    before = client.get(f"/campaigns/{cid}", headers=a).json()["posts"][0]
    storage = client.app.state.storage
    n_before = len(storage._objects)  # InMemoryStorage in tests
    r = client.patch(f"/campaigns/{cid}/posts/{pid}",
                     data={"scheduled_at": "2026-09-09T09:00:00+00:00"},   # out of window
                     files={"image": ("new.jpg", io.BytesIO(JPEG), "image/jpeg")}, headers=a)
    assert r.status_code == 422
    assert len(storage._objects) == n_before                              # no orphan object
    after = client.get(f"/campaigns/{cid}", headers=a).json()["posts"][0]
    assert after["media_object_key"] == before["media_object_key"]        # row untouched
    assert after["status"] == before["status"]


def test_patch_unschedule_and_scheduled_at_both_422(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    r = client.patch(f"/campaigns/{cid}/posts/{pid}",
                     data={"unschedule": "true", "scheduled_at": "2026-08-20T09:00:00+00:00"},
                     headers=a)
    assert r.status_code == 422


def test_second_agent_cannot_patch_foreign_post(client, second_agent_headers):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"caption": "x"},
                     headers=second_agent_headers)
    assert r.status_code == 404  # Review Focus #2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_posts.py -k patch -q`
Expected: FAIL — 405 (no PATCH route).

- [ ] **Step 3: Implement the route** (append to `campaigns.py`)

```python
_EDITABLE = {PostStatus.draft, PostStatus.pending_approval, PostStatus.rejected}


@router.patch("/{campaign_id}/posts/{post_id}", response_model=CampaignPostOut)
def edit_post(
    campaign_id: int,
    post_id: int,
    caption: str | None = Form(None),
    scheduled_at: str | None = Form(None),
    unschedule: bool = Form(False),
    image: UploadFile | None = File(None),
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    storage: Storage = Depends(get_storage),
    now: datetime = Depends(clock.now),
) -> CampaignPostOut:
    campaign = _owned_campaign(db, campaign_id, user)
    post = db.get(Post, post_id)
    if post is None or post.campaign_id != campaign.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    if post.status not in _EDITABLE:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Cannot edit a post in '{post.status.value}'")

    # ---- 1. Validate EVERYTHING before writing a byte or mutating the row ----
    # (otherwise an invalid schedule after an image upload leaves an orphaned object).
    if unschedule and scheduled_at is not None:
        raise HTTPException(422, "Pass either scheduled_at or unschedule, not both")
    if caption is not None:
        _validate_caption(caption)
    data = _read_jpeg(image) if image is not None else None
    new_sched_utc: datetime | None = None
    if scheduled_at is not None:
        dt = _parse_scheduled_at(scheduled_at)
        if not within_campaign_window(dt, campaign.starts_on, campaign.ends_on):
            raise HTTPException(422, "scheduled_at is outside the campaign window")
        new_sched_utc = dt.astimezone(timezone.utc)

    # ---- 2. All checks passed — now write (object first, then the row) ----
    if caption is not None:
        post.caption = caption
    if data is not None:
        key = f"campaign-posts/{post.id}/{int(now.timestamp())}.jpg"
        storage.put_object(key, data, "image/jpeg")
        post.media_object_key = key  # old object left in storage (orphan cleanup out of PoC scope)
    if unschedule:
        post.scheduled_at = None
        post.status = PostStatus.draft
    elif scheduled_at is not None:
        post.scheduled_at = new_sched_utc
        post.status = PostStatus.pending_approval
    # Inc 2 also clears approval fields here (approved_by/reviewed_at/review_note) once added.

    audit.record(db, actor_id=user.id, action="edit", target_type="post", target_id=post.id)
    db.commit()
    db.refresh(post)
    return CampaignPostOut.model_validate(post)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && .venv/bin/pytest tests/test_campaign_posts.py -q`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/routers/campaigns.py apps/api/tests/test_campaign_posts.py
git commit -m "feat(api): PATCH edit/reschedule campaign post (editable states only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Regenerate the OpenAPI types (API → shared client bridge)

**Files:**
- Modify (generated): `packages/shared/openapi.json`, `packages/shared/src/api-types.ts`

**Interfaces:**
- Produces: generated TS types `CampaignCreate`, `CampaignOut`, `CampaignDetailOut`, `CampaignPostOut` under `components["schemas"]`, consumed by Task 8.

- [ ] **Step 1: Regenerate**

Run from the repo root (the API's venv must import; the script runs `python3 scripts/dump_openapi.py`):

```bash
PYTHON=apps/api/.venv/bin/python pnpm gen:api-types
```

- [ ] **Step 2: Verify the new schemas landed**

Run: `grep -n "CampaignOut\|CampaignDetailOut\|CampaignCreate\|CampaignPostOut" packages/shared/src/api-types.ts`
Expected: each appears under `components["schemas"]`.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/openapi.json packages/shared/src/api-types.ts
git commit -m "chore(shared): regenerate OpenAPI types for campaign endpoints

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Shared-client campaign methods

**Files:**
- Modify: `packages/shared/src/client.ts`

**Interfaces:**
- Consumes: `send`, `json` helpers; generated `Schemas`.
- Produces: `createCampaign`, `listCampaigns`, `getCampaign`, `scheduleCampaignPost`, `patchCampaignPost`; types `Campaign`, `CampaignDetail`, `CampaignPost`. (Thin pass-throughs — `testing.md` suppresses unit tests for these; verified by typecheck + the e2e in Task 13.)

- [ ] **Step 1: Add types + methods** (near the other social methods, ~line 507)

```ts
export type Campaign = Schemas["CampaignOut"];
export type CampaignDetail = Schemas["CampaignDetailOut"];
export type CampaignPost = Schemas["CampaignPostOut"];
export type CampaignCreate = Schemas["CampaignCreate"];

export async function createCampaign(body: CampaignCreate): Promise<Campaign> {
  return (await (await send("/campaigns", json(body))).json()) as Campaign;
}
export async function listCampaigns(): Promise<Campaign[]> {
  return (await (await send("/campaigns")).json()) as Campaign[];
}
export async function getCampaign(id: number): Promise<CampaignDetail> {
  return (await (await send(`/campaigns/${id}`)).json()) as CampaignDetail;
}
export async function scheduleCampaignPost(id: number, form: FormData): Promise<CampaignPost> {
  return (await (await send(`/campaigns/${id}/posts`,
    { method: "POST", body: form })).json()) as CampaignPost;
}
export async function patchCampaignPost(
  id: number, postId: number, form: FormData,
): Promise<CampaignPost> {
  return (await (await send(`/campaigns/${id}/posts/${postId}`,
    { method: "PATCH", body: form })).json()) as CampaignPost;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -w typecheck` (or `pnpm --filter @walsh/shared build`).
Expected: no type errors; the generated `Schemas` keys resolve.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/client.ts
git commit -m "feat(shared): campaign client methods

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Pure calendar helpers (+ Vitest)

**Files:**
- Create: `apps/web/lib/campaigns/calendar.ts`, `apps/web/lib/campaigns/calendar.test.ts`

**Interfaces:**
- Produces: `monthCells(year, month) -> (Date | null)[]` (Monday-aligned, leading nulls); `localDateKey(iso) -> "YYYY-MM-DD"` (browser-local); `bucketByLocalDay(posts) -> Map<string, CampaignPost[]>` (skips un-scheduled); `STATUS_CHIP: Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/campaigns/calendar.test.ts
import { describe, expect, it } from "vitest";
import { bucketByLocalDay, localDateKey, monthCells } from "./calendar";

describe("monthCells", () => {
  it("pads to the first Monday and lists every day", () => {
    const cells = monthCells(2026, 7); // August 2026 (0-based) — 1 Aug is a Saturday
    expect(cells.filter((c) => c === null).length).toBe(5); // Mon..Fri padding before Sat
    expect(cells.filter((c) => c !== null).length).toBe(31);
  });
});

describe("bucketByLocalDay", () => {
  it("buckets by local date and skips un-scheduled posts", () => {
    const rows = [
      { scheduled_at: "2026-08-15T12:00:00Z", id: 1 },
      { scheduled_at: "2026-08-15T18:00:00Z", id: 2 },
      { scheduled_at: null, id: 3 },
    ] as never[];
    const m = bucketByLocalDay(rows);
    expect(m.get(localDateKey("2026-08-15T12:00:00Z"))?.length).toBe(2);
    expect([...m.values()].flat().some((p: { id: number }) => p.id === 3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run lib/campaigns/calendar.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/campaigns/calendar.ts
// Pure calendar helpers (no DOM). Dates render in the viewer's local timezone (design §4.1);
// there is no date library in this app, so we build the grid from native Date.

export function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday = 0
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  return cells;
}

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function bucketByLocalDay<T extends { scheduled_at: string | null }>(
  posts: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of posts) {
    if (!p.scheduled_at) continue;
    const key = localDateKey(p.scheduled_at);
    const list = m.get(key) ?? [];
    list.push(p);
    m.set(key, list);
  }
  return m;
}

export const STATUS_CHIP: Record<string, string> = {
  draft: "chip-draft",
  pending_approval: "chip-draft",
  approved: "chip-verified",
  publishing: "chip-draft",
  published: "chip-verified",
  rejected: "chip-draft",
  failed: "chip-draft",
  cancelled: "chip-draft",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run lib/campaigns/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/campaigns/calendar.ts apps/web/lib/campaigns/calendar.test.ts
git commit -m "feat(web): pure calendar helpers for campaigns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `buildCampaignPostForm` (+ Vitest)

**Files:**
- Create: `apps/web/lib/campaigns/form.ts`, `apps/web/lib/campaigns/form.test.ts`

**Interfaces:**
- Produces: `buildCampaignPostForm({ compositionId, caption, scheduledAtISO, jpeg }) -> FormData` (mirrors `lib/studio/instagram.ts` `buildPublishForm`). Consumed by Task 12.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/campaigns/form.test.ts
import { describe, expect, it } from "vitest";
import { buildCampaignPostForm, localInputToOffsetISO } from "./form";

describe("buildCampaignPostForm", () => {
  it("appends fields and the JPEG file; omits scheduled_at when absent", () => {
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const f = buildCampaignPostForm({ compositionId: 7, caption: "Hi",
      scheduledAtISO: "2026-08-15T09:30:00+05:30", jpeg });
    expect(f.get("composition_id")).toBe("7");
    expect(f.get("caption")).toBe("Hi");
    expect(f.get("scheduled_at")).toBe("2026-08-15T09:30:00+05:30");
    expect(f.get("image")).toBeInstanceOf(File);

    const f2 = buildCampaignPostForm({ compositionId: 7, caption: "", scheduledAtISO: null, jpeg });
    expect(f2.has("scheduled_at")).toBe(false);
  });
});

describe("localInputToOffsetISO", () => {
  it("keeps the local wall time and appends an offset (never converts to Z)", () => {
    // Environment-independent: the local Y-M-D-H-M must be preserved and an offset appended,
    // so the API sees the viewer's local date — not a UTC-shifted one.
    expect(localInputToOffsetISO("2026-08-16T01:30")).toMatch(
      /^2026-08-16T01:30:00[+-]\d{2}:\d{2}$/,
    );
  });
});

describe("buildCampaignPatchForm", () => {
  it("includes only the provided fields; unschedule wins over scheduled_at", () => {
    const a = buildCampaignPatchForm({ caption: "New" });
    expect(a.get("caption")).toBe("New");
    expect(a.has("scheduled_at")).toBe(false);
    expect(a.has("unschedule")).toBe(false);

    const b = buildCampaignPatchForm({ scheduledAtISO: "2026-08-20T09:00:00+05:30" });
    expect(b.get("scheduled_at")).toBe("2026-08-20T09:00:00+05:30");

    const c = buildCampaignPatchForm({ unschedule: true, scheduledAtISO: "2026-08-20T09:00:00+05:30" });
    expect(c.get("unschedule")).toBe("true");
    expect(c.has("scheduled_at")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run lib/campaigns/form.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// apps/web/lib/campaigns/form.ts
// Pure FormData builder for scheduling a post into a campaign (mirrors lib/studio/instagram.ts).

export interface CampaignPostFormInput {
  compositionId: number;
  caption: string;
  scheduledAtISO: string | null;
  jpeg: Blob;
}

export function buildCampaignPostForm(input: CampaignPostFormInput): FormData {
  const form = new FormData();
  form.append("composition_id", String(input.compositionId));
  form.append("caption", input.caption);
  if (input.scheduledAtISO) form.append("scheduled_at", input.scheduledAtISO);
  form.append("image", new File([input.jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}

// Convert a <input type="datetime-local"> value (the viewer's wall-clock time, "YYYY-MM-DDTHH:mm")
// to an OFFSET-AWARE ISO string that keeps that wall time and appends the viewer's UTC offset.
// NOT new Date(x).toISOString() — that converts to a 'Z' instant, which would make the API validate
// the campaign window against the UTC date instead of the viewer's local date (design §4.1).
export function localInputToOffsetISO(local: string): string {
  const d = new Date(local); // parsed as local time
  const offMin = -d.getTimezoneOffset(); // e.g. +330 for IST, DST-correct for this date
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${off}`
  );
}

export interface CampaignPatchInput {
  caption?: string;
  scheduledAtISO?: string | null; // offset-aware ISO to set; ignored when `unschedule` is true
  unschedule?: boolean;
  jpeg?: Blob | null; // optional replacement render (not surfaced in the Inc 1 UI)
}

export function buildCampaignPatchForm(input: CampaignPatchInput): FormData {
  const form = new FormData();
  if (input.caption !== undefined) form.append("caption", input.caption);
  if (input.unschedule) form.append("unschedule", "true");
  else if (input.scheduledAtISO) form.append("scheduled_at", input.scheduledAtISO);
  if (input.jpeg) form.append("image", new File([input.jpeg], "post.jpg", { type: "image/jpeg" }));
  return form;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run lib/campaigns/form.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/campaigns/form.ts apps/web/lib/campaigns/form.test.ts
git commit -m "feat(web): buildCampaignPostForm (capture-at-schedule FormData)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Campaigns list + create page (+ nav + quick link)

**Files:**
- Create: `apps/web/app/agent/campaigns/page.tsx`
- Modify: `apps/web/components/shell/AppShell.tsx`, `apps/web/app/agent/page.tsx`

**Interfaces:**
- Consumes: `listCampaigns`, `createCampaign`, `ApiError` from `../../lib/api`.

- [ ] **Step 1: Add the nav entry, icon, and crumb label** (`AppShell.tsx`)

In the `I` icon map (lines ~19-35) add a calendar glyph:
```ts
  calendar: "M7 3v2M17 3v2M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
```
In `NAV.tourism_agent` (lines ~38-48), after the Social entry:
```ts
    { href: "/agent/campaigns", label: "Campaigns", icon: I.calendar },
```
In `CRUMB_LABELS` (lines ~74-95):
```ts
  campaigns: "Campaigns",
```

- [ ] **Step 2: Add the agent-home quick link** (`app/agent/page.tsx`, `QUICK_LINKS` ~22-27)

```ts
  { href: "/agent/campaigns", title: "Plan campaigns", body: "Schedule posts across a calendar" },
```

- [ ] **Step 3: Write the page** (mirrors `app/agent/collections/page.tsx` + `app/agent/social/page.tsx`)

```tsx
// apps/web/app/agent/campaigns/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../../../components/ui/PageHeader";
import { ApiError, createCampaign, listCampaigns, type Campaign } from "../../../lib/api";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCampaigns()
      .then((c) => setCampaigns(c))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load campaigns."));
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startsOn || !endsOn) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createCampaign({
        name: name.trim(), destination: destination.trim() || null,
        starts_on: startsOn, ends_on: endsOn,
      });
      setCampaigns((prev) => [created, ...(prev ?? [])]);
      setName(""); setDestination(""); setStartsOn(""); setEndsOn("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the campaign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Campaigns" description="Plan and schedule posts across a date range." />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onCreate} className="card mb-8 flex flex-wrap items-end gap-4 p-6" aria-busy={busy}>
        <label className="flex flex-col gap-1">
          <span className="label">Campaign name</span>
          <input className="field" aria-label="Campaign name" value={name}
                 onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Destination</span>
          <input className="field" aria-label="Destination" value={destination}
                 onChange={(e) => setDestination(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Starts</span>
          <input type="date" className="field" aria-label="Starts on" value={startsOn}
                 onChange={(e) => setStartsOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Ends</span>
          <input type="date" className="field" aria-label="Ends on" value={endsOn}
                 onChange={(e) => setEndsOn(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary h-12" disabled={busy}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </form>

      {campaigns === null ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-walshe-stone/60" aria-hidden />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card p-8 text-center text-walshe-grey">No campaigns yet.</div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <li key={c.id} className="card card-hover p-5">
              <Link href={`/agent/campaigns/${c.id}`} className="block">
                <div className="eyebrow text-[11px] capitalize">{c.status} · {c.destination ?? "—"}</div>
                <h3 className="mt-2 text-h3 text-walshe-ink">{c.name}</h3>
                <p className="mt-1 text-small text-walshe-grey">
                  {c.starts_on} → {c.ends_on} · {c.post_count} post{c.post_count === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/agent/campaigns/page.tsx apps/web/components/shell/AppShell.tsx apps/web/app/agent/page.tsx
git commit -m "feat(web): campaigns list + create page, nav + quick link

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Campaign detail — calendar + schedule-a-post (capture-at-schedule)

**Files:**
- Create: `apps/web/app/agent/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCampaign`, `scheduleCampaignPost`, `listProjects`/`getProject` (existing project client — see `app/agent/studio/page.tsx`), `renderDesignToJpegBlob` (`lib/studio/render.ts`), `migrateDesign` (`lib/studio/ops.ts`), `buildCampaignPostForm` (Task 10), `monthCells`/`bucketByLocalDay`/`STATUS_CHIP` (Task 9).

- [ ] **Step 1: Write the page**

```tsx
// apps/web/app/agent/campaigns/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PageHeader from "../../../../components/ui/PageHeader";
import {
  ApiError, getCampaign, getProject, listProjects, scheduleCampaignPost,
  type CampaignDetail,
} from "../../../../lib/api";
import { bucketByLocalDay, monthCells, STATUS_CHIP } from "../../../../lib/campaigns/calendar";
import { buildCampaignPostForm, localInputToOffsetISO } from "../../../../lib/campaigns/form";
import { renderDesignToJpegBlob } from "../../../../lib/studio/render";
import { migrateDesign } from "../../../../lib/studio/ops";

type Project = { id: number; name: string; design: unknown };

export default function CampaignDetailPage() {
  const id = Number(useParams().id);
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => getCampaign(id).then(setCampaign)
    .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the campaign."));

  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => {
    listProjects().then((p) => { setProjects(p as Project[]);
      if (p[0]) setProjectId(String((p[0] as Project).id)); }).catch(() => {});
  }, []);

  const byDay = useMemo(() => bucketByLocalDay(campaign?.posts ?? []), [campaign]);
  // Month navigation bounded to the campaign window (campaigns can span months).
  const [view, setView] = useState<{ year: number; month: number } | null>(null);
  useEffect(() => {
    if (campaign && !view) {
      const s = new Date(campaign.starts_on);
      setView({ year: s.getFullYear(), month: s.getMonth() });
    }
  }, [campaign, view]);
  const idx = (y: number, m: number) => y * 12 + m;
  const bStart = campaign ? new Date(campaign.starts_on) : null;
  const bEnd = campaign ? new Date(campaign.ends_on) : null;
  const canPrev = !!(view && bStart && idx(view.year, view.month) > idx(bStart.getFullYear(), bStart.getMonth()));
  const canNext = !!(view && bEnd && idx(view.year, view.month) < idx(bEnd.getFullYear(), bEnd.getMonth()));
  const shift = (d: number) =>
    setView((v) => (v ? { year: v.year + Math.floor((v.month + d) / 12), month: ((v.month + d) % 12 + 12) % 12 } : v));
  const cells = view ? monthCells(view.year, view.month) : [];

  async function onSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const project = (await getProject(Number(projectId))) as Project;
      const design = migrateDesign(project.design);
      const jpeg = await renderDesignToJpegBlob(design, 0);
      const form = buildCampaignPostForm({
        compositionId: Number(projectId), caption,
        scheduledAtISO: scheduledAt ? localInputToOffsetISO(scheduledAt) : null, jpeg,
      });
      await scheduleCampaignPost(id, form);
      setCaption(""); setScheduledAt("");
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not schedule the post.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title={campaign?.name ?? "Campaign"}
        description={campaign ? `${campaign.starts_on} → ${campaign.ends_on}` : ""} />

      {error && (
        <p role="alert" className="card mb-6 border-walshe-danger/30 p-4 text-small text-walshe-danger">
          {error}
        </p>
      )}

      <form onSubmit={onSchedule} className="card mb-8 flex flex-wrap items-end gap-4 p-6" aria-busy={busy}>
        <label className="flex flex-col gap-1">
          <span className="label">Project</span>
          <select className="field" aria-label="Project" value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name || `Project #${p.id}`}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Caption</span>
          <input className="field" aria-label="Caption" value={caption}
                 onChange={(e) => setCaption(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">When</span>
          <input type="datetime-local" className="field" aria-label="Scheduled at"
                 value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary h-12" disabled={busy || !projectId}>
          {busy ? "Scheduling…" : "Schedule post"}
        </button>
      </form>

      <section className="card p-5" aria-label="Calendar" data-testid="campaign-calendar">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="btn-ghost" disabled={!canPrev} onClick={() => shift(-1)}>
            ← Prev
          </button>
          <span className="font-semibold text-walshe-ink">
            {view
              ? new Date(view.year, view.month, 1).toLocaleDateString(undefined,
                  { month: "long", year: "numeric" })
              : ""}
          </span>
          <button type="button" className="btn-ghost" disabled={!canNext} onClick={() => shift(1)}>
            Next →
          </button>
        </div>
        <div className="mb-3 grid grid-cols-7 gap-2 text-small text-walshe-grey">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} className="min-h-20 rounded-sm bg-walshe-stone/30" aria-hidden />;
            const key = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(cell.getDate()).padStart(2, "0")}`;
            const posts = byDay.get(key) ?? [];
            return (
              <div key={key} className="min-h-20 rounded-sm border border-walshe-line p-1.5">
                <div className="text-[11px] text-walshe-grey">{cell.getDate()}</div>
                {posts.map((p) => (
                  <div key={p.id} className={`mt-1 truncate rounded px-1 text-[11px] ${STATUS_CHIP[p.status] ?? ""}`}>
                    {p.caption || `Post #${p.id}`}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

> Note: `getProject`/`listProjects` are the existing project client methods used by `app/agent/studio/page.tsx` (confirm the exact names there; Studio loads a saved project's `design` the same way). The render path (`renderDesignToJpegBlob(design, 0)`) is identical to `components/studio/ExportMenu.tsx:publish()` and needs no mounted canvas.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors. (If `getProject`/`listProjects`/`migrateDesign` names differ, align to the Studio page's imports.)

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/agent/campaigns/[id]/page.tsx"
git commit -m "feat(web): campaign detail calendar + schedule-a-post (capture-at-schedule)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Edit / reschedule UI on the campaign detail page

**Files:**
- Modify: `apps/web/app/agent/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `patchCampaignPost` (Task 8), `buildCampaignPatchForm` + `localInputToOffsetISO` (Task 10).
- Scope: caption + reschedule + unschedule. Image replacement is API-complete (`PATCH` accepts an `image`) but **not surfaced in the Inc 1 UI** (deferred) — a deliberate, documented scope line, not a silent omission.

- [ ] **Step 1: Add imports + edit state** (extend the detail page from Task 12)

```tsx
// add to the imports
import {
  ApiError, getCampaign, getProject, listProjects, patchCampaignPost, scheduleCampaignPost,
  type CampaignDetail, type CampaignPost,
} from "../../../../lib/api";
import {
  buildCampaignPatchForm, buildCampaignPostForm, localInputToOffsetISO,
} from "../../../../lib/campaigns/form";

// a display-only helper (ISO → datetime-local value, in the viewer's local time)
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
```

```tsx
// add alongside the other useState hooks
  const [selected, setSelected] = useState<CampaignPost | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editWhen, setEditWhen] = useState("");

  function openEdit(p: CampaignPost) {
    setSelected(p);
    setEditCaption(p.caption);
    setEditWhen(isoToLocalInput(p.scheduled_at));
  }

  async function onSaveEdit(unschedule: boolean) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await patchCampaignPost(id, selected.id, buildCampaignPatchForm({
        caption: editCaption,
        unschedule,
        scheduledAtISO: unschedule ? null : (editWhen ? localInputToOffsetISO(editWhen) : null),
      }));
      setSelected(null);
      await reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 2: Make each calendar post chip open the editor** (replace the chip `<div>` from Task 12 with a `<button>`)

```tsx
                {posts.map((p) => (
                  <button key={p.id} type="button" onClick={() => openEdit(p)}
                    className={`mt-1 block w-full truncate rounded px-1 text-left text-[11px] ${STATUS_CHIP[p.status] ?? ""}`}>
                    {p.caption || `Post #${p.id}`}
                  </button>
                ))}
```

- [ ] **Step 3: Add the edit panel** (after the calendar `</section>`)

```tsx
      {selected && (
        <section className="card mt-6 p-5" aria-label="Edit post" data-testid="edit-post-panel">
          <h2 className="mb-3 text-h3 font-bold text-walshe-ink">Edit post</h2>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className="label">Caption</span>
              <input className="field" aria-label="Edit caption" value={editCaption}
                     onChange={(e) => setEditCaption(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">When</span>
              <input type="datetime-local" className="field" aria-label="Edit scheduled at"
                     value={editWhen} onChange={(e) => setEditWhen(e.target.value)} />
            </label>
            <button type="button" className="btn-primary h-12" disabled={busy}
                    onClick={() => void onSaveEdit(false)}>Save changes</button>
            <button type="button" className="btn-secondary h-12" disabled={busy}
                    onClick={() => void onSaveEdit(true)}>Unschedule</button>
            <button type="button" className="btn-ghost h-12" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </div>
        </section>
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/agent/campaigns/[id]/page.tsx"
git commit -m "feat(web): edit/reschedule campaign post (caption, time, unschedule)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Playwright e2e — create campaign + calendar renders

**Files:**
- Create: `apps/web/e2e/campaigns-smoke.spec.ts`

- [ ] **Step 1: Write the spec** (mirrors `e2e/agent-features-smoke.spec.ts`)

```ts
// apps/web/e2e/campaigns-smoke.spec.ts
import { expect, test } from "@playwright/test";
import { allowApiCors, login } from "./_helpers";

test("agent creates a campaign and sees its calendar", async ({ page }) => {
  await allowApiCors(page);
  await login(page, "agent@example.test", /\/agent$/);
  await page.goto("/agent/campaigns");

  const name = `Australia ${Date.now()}`;
  await page.getByLabel("Campaign name").fill(name);
  await page.getByLabel("Starts on").fill("2026-08-01");
  await page.getByLabel("Ends on").fill("2026-08-31");
  await page.getByRole("button", { name: /create campaign/i }).click();

  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByText(name).first().click();
  await expect(page.getByTestId("campaign-calendar")).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

Run: `cd apps/web && pnpm playwright test campaigns-smoke`
Expected: PASS (the e2e API uses the deterministic stub; no real Instagram).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/campaigns-smoke.spec.ts
git commit -m "test(web): e2e create campaign + calendar render

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Full `make verify` green

**Files:** none (gate run; fix follow-ups in the owning task's files if anything fails).

- [ ] **Step 1: Run the full gate**

Run: `make verify`
Expected: lint → api-test → api-types-sync → web-typecheck → web-test → e2e → matrix → sync → compose-config all pass. The acceptance matrix stays at its current count (no new ACs this increment).

- [ ] **Step 2: Fix any failure** in the file that owns it (lint line-length, a stale type, etc.), re-running the specific sub-gate, then `make verify` again until green.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore(campaign): green make verify for increment 1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (completed by the plan author)

15 tasks. Revised after design-review round 2 — the fixes folded in: PATCH validates fully before any write (T6); real cross-agent isolation via a second-agent fixture (T4/T5/T6); accurate "no migration tool" wording (Global Constraints); bounded multi-month calendar nav (T12); a real edit/reschedule UI (T13); naive `scheduled_at` rejected with offset required (T5) and the client sends the local offset so window validation uses the viewer's local date (T10/T12); `default_factory=list` (T4); shared validation helpers used by POST and PATCH (T5); documented DB/storage non-transactionality (T5).

- **Spec coverage (Inc 1, design §9):** Campaign model (T1) · `Post.campaign_id` + statuses (T2) · window rule (T3) · create/list/detail + isolation (T4) · schedule-into-campaign + capture-at-schedule + window validation (T5) · `PATCH` edit/reschedule §7.1 (T6) · OpenAPI regen (T7) · shared client + types (T8) · pure calendar + form helpers (T9–T10) · list/create + nav + quick link (T11) · detail + calendar + schedule (T12) · edit/reschedule UI (T13) · e2e (T14) · `make verify` (T15). No Inc-2/Inc-3 scope leaked in (no approval columns, dispatcher, or analytics).
- **Review Focus → tests:** #1 offset/local-date → T3 `test_local_date_from_submitted_offset_not_utc`, T5 window case + `test_schedule_naive_datetime_422`, T10 `localInputToOffsetISO`; #2 cross-agent → T4 `test_second_agent_cannot_see_or_read…`, T5 `test_second_agent_cannot_schedule…`, T6 `test_second_agent_cannot_patch…`; #3 bad media / invalid change → T5 `test_schedule_non_jpeg_and_oversize_422`, T6 `test_patch_invalid_schedule_with_image_writes_nothing` (asserts no orphan object + row untouched); #4 empty collections → T4 (`[]` / `posts == []`); #5 edit on non-editable → T6 `test_patch_blocked_on_non_editable_status`.
- **Type consistency:** `CampaignPostOut.status: PostStatus`; routers return via `model_validate`; POST and PATCH share `_validate_caption` / `_parse_scheduled_at` / `_read_jpeg` (one semantics); shared TS types alias generated `Schemas` keys (T7 before T8); `scheduleCampaignPost(id, FormData)` / `patchCampaignPost(id, postId, FormData)` match the multipart routes; `buildCampaignPostForm` vs `buildCampaignPatchForm` are distinct (POST sends `composition_id` + required image; PATCH sends only provided fields).
- **Placeholders:** none — every code step carries real code. The one soft spot (exact `getProject`/`listProjects`/`migrateDesign` import names in T12) is flagged with the file to confirm against, not left as a TODO.
