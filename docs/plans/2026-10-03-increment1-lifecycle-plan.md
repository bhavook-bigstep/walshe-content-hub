# Implementation plan — Increment 1: Content lifecycle & validity (AC32–AC33)

**Date:** 2026-10-03 · **Phase:** B (plan) of `/oneshot-poc:run`
**Charter:** `docs/plans/2026-10-03-increment1-lifecycle-charter.md`
**Brainstorm:** `docs/brainstorms/2026-10-03-increment1-lifecycle.md` (chose **Approach A** —
read-time derivation in `visibility.py` + injectable `app/clock.py` + one `display_status` helper)
**Spec:** `REQUIREMENTS.md` v2.5.0, AC32–AC33. Sets 2–4 out of scope.

This plan is the reviewable contract the implement phase executes against. Every acceptance item
has exact files/functions/config, a dependency graph, and a named test. Determinism and hermetic,
synthetic fixtures only (`.claude/rules/testing.md`); no secrets/PII logged (`.claude/rules/security.md`).

---

## 0. Design decisions (locked)

| Decision | Choice | Why / source |
|---|---|---|
| Where expiry runs | Python post-filter inside `visibility.py` (one choke-point) | Charter constraint 2; matches existing `is_visible_to_agent` idiom (`apps/api/app/services/visibility.py:17`) |
| `expiring_soon`/`expired` | **Derived at read time**, never stored | Charter constraint 3; a stored+sweep design has a staleness window (brainstorm §3B) |
| Clock | One canonical `app/clock.py` `now()` FastAPI dependency; `now` threaded as a **required** arg into visibility functions | Charter constraint 1; FastAPI dependency-override testing — https://fastapi.tiangolo.com/advanced/testing-dependencies/ (accessed 2026-10-03). A missed call site fails loudly (no default) |
| `expiring_soon` window | Module constant `EXPIRING_SOON_WINDOW = timedelta(days=14)` in `app/lifecycle.py` | Chosen default — **No source found — this is an AI-generated idea.** A single constant keeps the helper pure; can later move to config |
| Master-edit flagging | `content_version` int on the entry (bumped on content PUT); `item_versions` snapshot on the composition; a project-resolve endpoint reports `flagged_item_ids` where current ≠ captured | Minimal, deterministic, testable; no new tables |
| Schema registration | Only **new columns** on existing tables (`catalog_entries`, `compositions`). No new models → `app/models/__init__.py` unchanged. `create_all` builds them on a fresh DB (`apps/api/app/db.py:34`) | Charter constraint 5 |

---

## 1. New files

### 1.1 `apps/api/app/clock.py` (new)
Canonical injectable clock — the single wall-clock source for request logic.
```python
from datetime import datetime, timezone
def now() -> datetime:
    """UTC now. The only place logic reads the wall clock. Override in tests via
    app.dependency_overrides[clock.now]."""
    return datetime.now(timezone.utc)
```
- Used as a FastAPI dependency: `now: datetime = Depends(clock.now)`.
- Tests override: `app.dependency_overrides[clock.now] = lambda: FIXED` (see §6).

### 1.2 `apps/api/app/lifecycle.py` (new)
Pure derivation helper — no DB, no clock import; `now` is passed in.
```python
from datetime import datetime, timedelta
from app.models.catalog import DisplayStatus, EntryStatus

EXPIRING_SOON_WINDOW = timedelta(days=14)

def display_status(stored: EntryStatus, expires_at: datetime | None, now: datetime,
                   *, soon_window: timedelta = EXPIRING_SOON_WINDOW) -> DisplayStatus:
    if stored == EntryStatus.withdrawn:
        return DisplayStatus.withdrawn
    if stored != EntryStatus.approved:
        return DisplayStatus(stored.value)          # draft / in_review pass through
    if expires_at is not None:
        if now >= expires_at:
            return DisplayStatus.expired
        if now >= expires_at - soon_window:
            return DisplayStatus.expiring_soon
    return DisplayStatus.approved

def is_expired(expires_at: datetime | None, now: datetime) -> bool:
    return expires_at is not None and now >= expires_at
```
- `is_expired` is the one predicate `visibility.py` calls, so the boundary rule lives once.
- Boundary semantics: `now == expires_at` ⇒ **expired** (half-open window `[valid, expires)`).

---

## 2. Model changes

### 2.1 `apps/api/app/models/catalog.py`
- Extend `EntryStatus`:
  ```python
  class EntryStatus(str, enum.Enum):
      draft = "draft"
      in_review = "in_review"   # NEW
      approved = "approved"
      withdrawn = "withdrawn"   # NEW
  ```
- Add `DisplayStatus` (stored values + the two derived ones) for typed serialisation:
  ```python
  class DisplayStatus(str, enum.Enum):
      draft = "draft"; in_review = "in_review"; approved = "approved"
      expiring_soon = "expiring_soon"; expired = "expired"; withdrawn = "withdrawn"
  ```
- Add columns to `CatalogEntry` (import `DateTime` from sqlalchemy):
  ```python
  valid_from:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
  expires_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
  content_version: Mapped[int] = mapped_column(default=1)   # bumped on master content edit (AC33)
  ```
- Keep `Enum(EntryStatus)` as-is (fresh `create_all` emits all four values). No data migration — PoC DB is recreated; `make verify` uses throwaway SQLite.

### 2.2 `apps/api/app/models/composition.py`
Add a per-item captured-version snapshot for flagging:
```python
item_versions: Mapped[dict] = mapped_column(JSON, default=dict)  # {str(entry_id): content_version}
```

### 2.3 `apps/api/app/models/__init__.py`
Export `DisplayStatus` (append to imports + `__all__`). No new tables.

---

## 3. Visibility choke-point (`apps/api/app/services/visibility.py`)

Thread a **required** `now` through every function; add the expired/withdrawn exclusion in the one
place. `withdrawn` is already excluded by the `status == approved` test; only `expired` needs the new
predicate.

- `is_visible_to_agent(entry, agent, *, now: datetime) -> bool`
  - after the existing `status == approved and brand_safe` check, add:
    `if lifecycle.is_expired(entry.expires_at, now): return False`
- `agent_visible_entries(db, agent, *, now, destination=None, type_=None, q=None)` — pass `now` into
  the per-row `is_visible_to_agent` call.
- `agent_visible_entries_by_ids(db, agent, ids, *, now)` — same.
- `visible_asset_or_none(db, user, object_key, *, now)` — pass `now` into its agent branch
  (`apps/api/app/services/visibility.py:96`).

`now` has **no default** → any un-updated call site is a hard failure at call time (mitigates the
"missed a site" risk from brainstorm §3A).

---

## 4. Serialisation (`EntryOut`)

### 4.1 `apps/api/app/schemas/catalog.py`
- `EntryOut` gains:
  ```python
  valid_from: datetime | None = None
  expires_at: datetime | None = None
  display_status: DisplayStatus
  ```
- Add a builder so routers don't duplicate derivation:
  ```python
  @classmethod
  def from_entry(cls, entry: "CatalogEntry", *, now: datetime) -> "EntryOut":
      return cls(
          id=entry.id, type=entry.type, title=entry.title, description=entry.description,
          destination=entry.destination, market_tags=entry.market_tags, status=entry.status,
          brand_safe=entry.brand_safe, provider_id=entry.provider_id,
          attributes=entry.attributes, highlights=entry.highlights,
          custom_sections=entry.custom_sections, asset_keys=entry.asset_keys,
          valid_from=entry.valid_from, expires_at=entry.expires_at,
          display_status=display_status(entry.status, entry.expires_at, now),
      )
  ```
- `AccessUpdate` gains optional `valid_from`/`expires_at` so a provider can set the validity window
  via the existing PATCH (`set_access`). `EntryCreate` gains optional `valid_from`/`expires_at`.

### 4.2 Validity window validation
In `EntryCreate`/`AccessUpdate`, add a model validator: if both set, require
`valid_from < expires_at` else 422. (Boundary input validated at the edge — `security.md`.)

---

## 5. Router changes (thread the clock; build `EntryOut` via the builder)

### 5.1 `apps/api/app/routers/catalog.py`
- Import `from app import clock` and `from app.schemas.catalog import EntryOut`.
- `list_for_agent` / `get_for_agent`: add `now: datetime = Depends(clock.now)`; pass `now=now` to
  `agent_visible_entries` / `is_visible_to_agent`; return `EntryOut.from_entry(e, now=now)`
  (list: a comprehension). Response model stays `list[EntryOut]` / `EntryOut`.
- `create_entry`: set `valid_from`/`expires_at` from body; return `EntryOut.from_entry(entry, now=now)`.
- `update_content` (master content PUT): **bump `entry.content_version += 1`** on any content change
  (this is the AC33 "editing a master item" trigger); return built `EntryOut`.
- `set_access` (PATCH): apply `valid_from`/`expires_at` when present; keep existing audit records
  (Contract 3); return built `EntryOut`. Setting `status=withdrawn` now flows through unchanged (the
  existing "was_approved and new != approved → unpublish audit" covers withdraw).

### 5.2 `apps/api/app/routers/builder.py`
`design`: add `now: datetime = Depends(clock.now)`; pass `now=now` into
`agent_visible_entries_by_ids`. (Expired items silently drop → fewer/zero visible → existing 404.)

### 5.3 `apps/api/app/routers/render.py`
`render_video` → `_scene_image_paths`: add `now` and pass into `agent_visible_entries_by_ids`.
Expired scene images resolve to `None` (scene renders without the image), proving schedule/render
propagation.

### 5.4 `apps/api/app/routers/assets.py`
`get_object` (line ~66): add `now: datetime = Depends(clock.now)`; pass into
`visible_asset_or_none`. An expired entry's asset becomes unreadable to agents.

### 5.5 `apps/api/app/routers/social.py`
Replace the local `get_clock` (`apps/api/app/routers/social.py:25-27`) with the canonical
`app.clock.now` so there is **one** clock to override. `schedule`/`publish` use
`now: datetime = Depends(clock.now)` instead of the `clock()` callable. (Keeps determinism and
removes duplication; tests already override a clock here.)

### 5.6 `apps/api/app/routers/agent.py` — projects (AC33 drop + flag)
- `create_project` / `update_project`: when `item_ids` is set, snapshot
  `item_versions = {str(i): entry.content_version}` for each resolvable entry (one `db.get` loop).
- **New endpoint** `GET /me/projects/{project_id}/resolved` → `ProjectResolved`:
  ```python
  @router.get("/projects/{project_id}/resolved", response_model=ProjectResolved)
  def resolve_project(project_id, db, agent=_agent_only, now=Depends(clock.now)):
      project = _owned_project(db, project_id, agent)
      visible = agent_visible_entries_by_ids(db, agent, project.item_ids, now=now)
      visible_ids = {e.id for e in visible}
      dropped = [i for i in project.item_ids if i not in visible_ids]        # expired/withdrawn/removed
      flagged = [e.id for e in visible
                 if project.item_versions.get(str(e.id)) not in (None, e.content_version)]
      return ProjectResolved(
          items=[EntryOut.from_entry(e, now=now) for e in visible],
          dropped_item_ids=dropped, flagged_item_ids=flagged)
  ```
  This single endpoint is the proof surface for **AC33**: `dropped_item_ids` = auto-withdraw
  propagation into saved projects; `flagged_item_ids` = master-edit flagging.

### 5.7 `apps/api/app/schemas/agent.py`
Add:
```python
class ProjectResolved(BaseModel):
    items: list[EntryOut]
    dropped_item_ids: list[int]
    flagged_item_ids: list[int]
```
`ProjectOut` gains `item_versions: dict = {}` (serialises for completeness).

---

## 6. Seed (`apps/api/app/seed.py`) — AC17 stays idempotent

- Import `from app.clock import now as clock_now` (single clock source; no bare `datetime.now`).
- Give the five seeded entries sensible, demo-legible validity relative to seed time `t = clock_now()`:
  - "Harbour Festival" → `expires_at = t + 5d` → **expiring_soon** (inside the 14-day window).
  - "Trade Showcase" → `expires_at = t - 10d` → **expired** (demonstrates auto-withdraw: absent from
    the agent catalog on its own).
  - the other three → `valid_from = t - 30d`, `expires_at = None` → **approved/current**.
- Set `content_version=1` (default) and the composition's `item_versions` snapshot on create.
- `_upsert_entry` sets these **only on insert** → re-running yields identical row counts (idempotent);
  timestamps shift per fresh seed but that doesn't affect counts (AC17 is a count/stability check —
  see `apps/api/tests/test_seed.py`).

---

## 7. OpenAPI / TS types (charter constraint 4)

New fields on `EntryOut`/`EntryCreate`/`AccessUpdate`/`ProjectOut` + new `ProjectResolved` and
`DisplayStatus` enum change the schema. Regenerate the committed artifacts so `make api-types-sync`
passes:
```
node scripts/gen-api-types.mjs          # writes packages/shared/openapi.json + src/api-types.ts
```
(The gate is `scripts/check_api_types_sync.py`, invoked by `make api-types-sync`.)

---

## 8. Web (minimal — AC32 e2e proof only)

AC33 is API-proven; AC32 needs the status + validity **visible on a catalog item**.
- `apps/web/app/agent/catalog/page.tsx`: on each entry card render a small badge from
  `entry.display_status` and, when present, the `entry.expires_at` date (e.g. "Expires 18 Jul 2026"
  / an "Expiring soon" pill). `Entry` already = `Schemas["EntryOut"]` (`packages/shared/src/client.ts:6`),
  so the new fields arrive once types regenerate.
- Add a `data-testid="entry-status"` (and `entry-validity`) so the e2e can assert deterministically.
- No new web logic beyond display; keep empty/loading states already present.

---

## 9. Dependency graph (implement in this order)

```
clock.py ─┐
          ├─> lifecycle.py ──> schemas/catalog.py (EntryOut.from_entry, validators)
models/catalog.py (enum+cols, DisplayStatus) ─┤        │
models/composition.py (item_versions) ────────┘        │
models/__init__.py (export DisplayStatus)              │
          │                                            │
          └─> services/visibility.py (thread `now`, is_expired)
                   │
                   ├─> routers/catalog.py (clock, from_entry, content_version bump)
                   ├─> routers/builder.py · render.py · assets.py (thread `now`)
                   ├─> routers/social.py (adopt clock.now)
                   └─> routers/agent.py + schemas/agent.py (item_versions, /resolved)
                            │
seed.py (validity fixtures) │
          │                 │
          └──> regen OpenAPI/TS (node scripts/gen-api-types.mjs)
                   │
                   └──> web catalog badges (AC32 e2e)
                            │
                            └──> tests (§10) ──> make verify
```
Leaf-first: nothing downstream compiles until the model/helper/clock exist.

---

## 10. Tests (one per acceptance item + risk paths)

All API tests live in **`apps/api/tests/test_lifecycle.py`** (new). They override the clock per the
cited FastAPI pattern:
```python
from app import clock
def _fix_clock(app, instant): app.dependency_overrides[clock.now] = lambda: instant
```
Fixtures are synthetic (reuse `conftest.py` users; fake `test-*` creds). A fixed base instant
`T0 = datetime(2026, 6, 1, tzinfo=utc)` anchors every case.

### AC32
- **`test_display_status_derived_from_clock`** — unit over `lifecycle.display_status` at the
  boundaries with `expires_at = T0 + 10d`, `soon_window = 14d`:
  - `now = T0` (≥ 24d before) → `approved`
  - `now = T0 + 1d` (within 14d of expiry) → `expiring_soon`
  - `now = T0 + 10d` (== expires_at) → `expired` (half-open boundary)
  - `now = T0 + 11d` → `expired`
  - `stored=withdrawn` → `withdrawn`; `stored=draft` → `draft` (regardless of dates).
- **`test_validity_and_status_serialise_on_entry`** — via `TestClient`: provider creates an entry
  with `valid_from`/`expires_at`, approves + brand-safe; GET `/catalog/{id}` as agent returns
  `valid_from`, `expires_at`, `display_status` present and correct for the overridden clock; assert
  the same three fields serialise on the provider's PATCH response too ("for every role").

### AC33
- **`test_expired_absent_from_agent_catalog_and_search`** — approved+brand-safe entry with
  `expires_at = T0 + 1d`. Clock at `T0` → appears in `GET /catalog` and `?q=`. Clock at `T0 + 2d`
  (re-override) → **absent** from both the list and the search, and `GET /catalog/{id}` → 404
  (indistinguishable-from-missing, Contract 1).
- **`test_expired_dropped_from_projects_and_schedule`** — agent saves a project whose `item_ids`
  include the entry; schedule a post for that composition. Clock before expiry: `GET
  /me/projects/{id}/resolved` → item in `items`, `dropped_item_ids == []`; the scheduled `Post`
  exists. Clock after expiry: `resolved` → item in `dropped_item_ids`, absent from `items`; and the
  render/builder path (`POST /builder/design` with that id) → 404 "No visible catalog items",
  proving the scheduled/derived content loses it **on its own** (no mutation performed).
- **`test_master_edit_flags_in_use_copies`** — agent project captures `item_versions` at save.
  Provider PUTs `/catalog/{id}` content (title change) → `content_version` bumps. `GET
  /me/projects/{id}/resolved` → the id appears in `flagged_item_ids` while still in `items`
  (in-use copy flagged, not removed). A project whose item was **not** edited has empty
  `flagged_item_ids` (control).

### Regression / risk
- **`test_withdrawn_hidden_from_agent`** — `status=withdrawn` entry never visible to the agent
  (list + direct GET 404), proving the stored-status exclusion.
- Existing suites must stay green; the clock-threading touches `test_visibility_contract.py`,
  `test_visibility_by_ids.py`, `test_catalog_*`, `test_builder.py`, `test_video.py`,
  `test_assets.py`, `test_social.py`. Where a test calls a visibility function directly it must now
  pass `now=...`; where it goes through the API the default `clock.now` applies (no override needed
  for non-time-sensitive cases). Budget time to update these call sites.

### Web e2e — **`apps/web/e2e/lifecycle-smoke.spec.ts`** (new)
- **`catalog item shows its status and validity`** — sign in as the seeded agent, open
  `/agent/catalog`, assert an entry card shows `data-testid="entry-status"` with a lifecycle label
  and (for the expiring-soon seed) an `entry-validity` date. Uses the Playwright stub config (no
  keys), deterministic against the seed.

**Coverage:** new logic (`clock.py`, `lifecycle.py`, visibility expiry, `/resolved`, `from_entry`)
is exercised by the above; target ~90% on changed lines, risk paths (boundary, withdrawn, dropped,
flagged) first (`.claude/rules/testing.md`).

### Manifest alignment
`requirements.manifest.yaml` already names these node ids (AC32 lines 181–184, AC33 lines 188–190):
`test_display_status_derived_from_clock`, `test_validity_and_status_serialise_on_entry`,
`test_expired_absent_from_agent_catalog_and_search`,
`test_expired_dropped_from_projects_and_schedule`, `test_master_edit_flags_in_use_copies`, and
`lifecycle-smoke.spec.ts::catalog item shows its status and validity`. **Test names must match
exactly** — the acceptance matrix keys on them.

---

## 11. Verification

`make verify` (the gate): `lint → api-test → api-types-sync → web-typecheck → web-test → e2e →
matrix → sync → compose-config`. After `make verify`, restart the dev server before any manual
check (memory: `devserver-rebuild-after-verify.md`). Branch `feat/content-hub-poc`; **no push/PR**.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A visibility call site keeps reading the real clock | `now` is a **required** kwarg (no default) → fails loudly, not silently |
| Enum change breaks committed OpenAPI/TS | Regen step §7 is in the dependency graph before web + `make api-types-sync` catches drift |
| Existing tests call visibility helpers positionally | §10 lists every affected suite; update call sites in the same change |
| Seed timestamps non-deterministic | AC17 checks row **counts**/idempotency, not timestamps; values derive from the one `clock.now` |
| `native_enum` / Postgres enum alter | PoC uses `create_all` on a fresh DB; no in-place ALTER needed. Flag if a persistent dev DB is reused (recreate it) |

## 13. Citations
- Injectable clock via dependency override — *Testing Dependencies with Overrides, FastAPI* —
  https://fastapi.tiangolo.com/advanced/testing-dependencies/ (accessed 2026-10-03). Confirms
  `app.dependency_overrides[dep]` is the supported per-test swap used for `clock.now`.
- Read-time-vs-sweep rationale carried from the brainstorm (TiDB TTL staleness window) —
  `docs/brainstorms/2026-10-03-increment1-lifecycle.md` §4.
- `EXPIRING_SOON_WINDOW = 14d` default — **No source found — this is an AI-generated idea.**
- All repo-internal claims cite `path:line` inline above (per `.claude/rules/citations.md`).
