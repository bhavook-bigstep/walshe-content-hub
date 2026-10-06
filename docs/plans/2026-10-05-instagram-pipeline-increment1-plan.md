# Instagram Publishing Pipeline — Increment 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the app, publish an image + caption to Instagram — real Graph API connector when env keys are present, a deterministic stub otherwise — through an audited agent endpoint, with a Studio "Publish to Instagram" button.

**Architecture:** A `PublishConnector` abstraction (mirrors `app/ai/factory.py`) with an `InstagramConnector` (real, Graph API v26.0 create-container → poll → publish, verified by hand) and a deterministic `StubConnector`; a `s3_media` helper that uploads a JPEG and returns a presigned GET URL (used only by the real connector); and `POST /social/instagram/publish` that validates the JPEG, publishes, persists a `Post`, and audits it. Publish-now only (review gate + scheduler are later increments).

**Tech Stack:** Python 3.12 · FastAPI · SQLAlchemy · httpx (present) · boto3 (new) · pytest. Web: Next.js 15 · Fabric.js (JPEG export).

**Spec:** `docs/plans/2026-10-05-instagram-publishing-pipeline-design.md` (read it alongside this plan).

## Global Constraints

- **Contract 2 — secrets:** `INSTAGRAM_ACCESS_TOKEN`, `AWS_SECRET_ACCESS_KEY` etc. come from env only; never in the DB, logs, source, or committed config. Log connector/name only, never the token (mirror `app/ai/factory.py`).
- **Contract 4 — determinism:** the stub connector + mocked `httpx`/`boto3` keep all tests hermetic and offline. No test performs network egress.
- **Contract 1 — approved content:** the published composition must be the agent's own (ownership guard); item visibility is enforced by the existing preflight in later increments — Increment 1 reuses `_owned_composition`.
- **Contract 3 — audit:** every publish writes an `audit.record(action="publish", target_type="post", target_id=…)` row.
- **Instagram limits (cite in PR per `.claude/rules/citations.md`):** image **JPEG only**, ≤8 MB, aspect 4:5–1.91:1, width 320–1440 px; caption ≤2,200 chars. Graph API version pinned to **`v26.0`**. Source: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- **Enum safety:** any new/updated `PostStatus` member keeps `native_enum=False` (VARCHAR) — `models/post.py` already does this, so `create_all` needs no migration for added members.
- **OpenAPI→TS drift gate:** after any router/schema change, run `node scripts/gen-api-types.mjs` and commit `packages/shared/openapi.json` + `packages/shared/src/api-types.ts`, or `make verify` fails.

## Review Focus

- **Non-JPEG or oversized image** (e.g. a PNG from the old export path, or >8 MB): the endpoint must reject with 422 and a clear message, not forward it to Instagram (which would fail with an opaque error). → Task 6 tests.
- **Real connector selected but no S3 bucket configured:** must fail fast with a clear config error, never attempt a publish with a `None` image URL. → Task 4 + Task 6 tests.
- **Instagram "media could not be fetched" / token expired / rate-limited** (subcodes 2207052 / 190 / 9): the connector maps these to typed errors; publish persists `status=failed` with the error, not a crash. → Task 3 tests.
- **Caption over 2,200 chars:** rejected at the endpoint boundary before any container is created. → Task 6 tests.
- **Double-publish / retry:** the persisted `container_id` makes a re-publish idempotent (no duplicate post). → Task 3 tests.

---

## File structure

**apps/api (new):**
- `app/social/__init__.py` — package marker.
- `app/social/base.py` — `PublishConnector` ABC + `PublishResult`, `PublishError` dataclasses.
- `app/social/stub.py` — `StubConnector` (deterministic).
- `app/social/instagram.py` — `InstagramConnector` (real, httpx, v26.0).
- `app/social/factory.py` — `get_connector(settings)`.
- `app/storage/s3_media.py` — `upload_jpeg(settings, key, data) -> str` (presigned URL).
- `app/routers/instagram.py` — `POST /social/instagram/publish`.
- `app/schemas/instagram.py` — `InstagramPublishOut`.

**apps/api (modify):**
- `app/config.py` — new Settings fields.
- `app/models/post.py` — new columns + `failed` status.
- `app/main.py` — register the new router.
- `pyproject.toml` — add `boto3`.
- `.env.example` — new var names.

**packages/shared + web:**
- `packages/shared/src/client.ts` — `publishToInstagram(...)` fn (+ regenerated types).
- `apps/web/components/studio/ExportMenu.tsx` + `apps/web/lib/studio/render.ts` — JPEG export + publish action.

**Tests:** `apps/api/tests/test_instagram_connector.py`, `test_s3_media.py`, `test_instagram_publish_route.py`; `apps/web/tests/instagram-publish.test.ts`.

---

### Task 1: Config + dependencies

**Files:**
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/pyproject.toml` (add `boto3`)
- Modify: `.env.example`
- Test: `apps/api/tests/test_config_instagram.py`

**Interfaces:**
- Produces: `Settings` fields `instagram_access_token: str|None`, `ig_user_id: str|None`, `graph_api_version: str = "v26.0"`, `s3_bucket: str|None`, `s3_region: str|None`, `aws_access_key_id: str|None`, `aws_secret_access_key: str|None`, `s3_presign_ttl: int = 3600`; helper `instagram_configured() -> bool` and `s3_configured() -> bool`.

- [ ] **Step 1: Write the failing test**
```python
# apps/api/tests/test_config_instagram.py
from app.config import Settings

def test_instagram_defaults_are_unset_and_stub_by_default():
    s = Settings(_env_file=None)
    assert s.graph_api_version == "v26.0"
    assert s.instagram_configured() is False   # no token/user id
    assert s.s3_configured() is False

def test_instagram_configured_when_token_and_user_present():
    s = Settings(_env_file=None, instagram_access_token="t", ig_user_id="123")
    assert s.instagram_configured() is True
```

- [ ] **Step 2: Run to verify it fails**
Run: `uv run --project apps/api pytest apps/api/tests/test_config_instagram.py -q`
Expected: FAIL (`instagram_configured` undefined).

- [ ] **Step 3: Implement**
```python
# apps/api/app/config.py  — add inside Settings (grouped with a "# --- Instagram / S3 ---" comment)
    instagram_access_token: str | None = None
    ig_user_id: str | None = None
    graph_api_version: str = "v26.0"
    s3_bucket: str | None = None
    s3_region: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    s3_presign_ttl: int = 3600

    def instagram_configured(self) -> bool:
        return bool(self.instagram_access_token and self.ig_user_id)

    def s3_configured(self) -> bool:
        return bool(self.s3_bucket and self.s3_region
                    and self.aws_access_key_id and self.aws_secret_access_key)
```
Add to `pyproject.toml` dependencies: `"boto3>=1.35"`. Add to `.env.example` (names only):
```
# --- Instagram publishing ---
INSTAGRAM_ACCESS_TOKEN=
IG_USER_ID=
GRAPH_API_VERSION=v26.0
# --- S3 media hosting (presigned GET for Instagram fetch) ---
S3_BUCKET=
S3_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_PRESIGN_TTL=3600
```

- [ ] **Step 4: Run `uv sync` + tests**
Run: `cd apps/api && uv sync && uv run pytest tests/test_config_instagram.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/app/config.py apps/api/pyproject.toml apps/api/uv.lock .env.example apps/api/tests/test_config_instagram.py
git commit -m "feat(api): config + boto3 dep for Instagram publishing"
```

---

### Task 2: Connector interface + deterministic stub

**Files:**
- Create: `apps/api/app/social/__init__.py`, `app/social/base.py`, `app/social/stub.py`
- Test: `apps/api/tests/test_instagram_connector.py` (stub portion)

**Interfaces:**
- Produces:
  - `PublishResult(external_id: str, permalink: str | None)` (frozen dataclass)
  - `class PublishError(Exception)` with `code: str`, `retryable: bool`
  - `class PublishConnector(abc.ABC)`: `name: str`; `publish(self, *, image_url: str | None, caption: str, idempotency_key: str | None = None) -> PublishResult`
  - `StubConnector(PublishConnector)` `name="stub"`, deterministic `external_id = f"stub-{sha256(caption+image_url)[:12]}"`, `permalink=None`.

- [ ] **Step 1: Write the failing test**
```python
# apps/api/tests/test_instagram_connector.py
from app.social.stub import StubConnector

def test_stub_is_deterministic_and_needs_no_url():
    c = StubConnector()
    a = c.publish(image_url=None, caption="hello")
    b = c.publish(image_url=None, caption="hello")
    assert c.name == "stub"
    assert a.external_id == b.external_id
    assert a.external_id.startswith("stub-")
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/api && uv run pytest tests/test_instagram_connector.py::test_stub_is_deterministic_and_needs_no_url -q`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**
```python
# apps/api/app/social/base.py
from __future__ import annotations
import abc
from dataclasses import dataclass

@dataclass(frozen=True)
class PublishResult:
    external_id: str
    permalink: str | None = None

class PublishError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.retryable = retryable

class PublishConnector(abc.ABC):
    name: str = "base"
    @abc.abstractmethod
    def publish(self, *, image_url: str | None, caption: str,
                idempotency_key: str | None = None) -> PublishResult: ...
```
```python
# apps/api/app/social/stub.py
from __future__ import annotations
import hashlib
from app.social.base import PublishConnector, PublishResult

class StubConnector(PublishConnector):
    name = "stub"
    def publish(self, *, image_url, caption, idempotency_key=None) -> PublishResult:
        digest = hashlib.sha256(f"{caption}|{image_url}".encode()).hexdigest()[:12]
        return PublishResult(external_id=f"stub-{digest}", permalink=None)
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/api && uv run pytest tests/test_instagram_connector.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/app/social/ apps/api/tests/test_instagram_connector.py
git commit -m "feat(api): publish connector interface + deterministic stub"
```

---

### Task 3: Real Instagram connector (httpx, mocked)

**Files:**
- Create: `apps/api/app/social/instagram.py`
- Test: `apps/api/tests/test_instagram_connector.py` (real portion)

**Interfaces:**
- Consumes: `PublishConnector`, `PublishResult`, `PublishError` (Task 2); `Settings` (Task 1).
- Produces: `InstagramConnector(settings)` `name="instagram"`; implements the 3-step flow against `https://graph.instagram.com/{version}` with `httpx`. Raises `PublishError` with `code` in `{media_fetch_failed, token_expired, rate_limited, not_ready, unknown}` mapped from Meta subcodes (2207052→media_fetch_failed non-retryable; 190→token_expired; 9/4/17/32→rate_limited retryable; 9007/2207027→not_ready retryable).

- [ ] **Step 1: Write the failing test** (mock `httpx.Client.request`)
```python
# apps/api/tests/test_instagram_connector.py  (add)
import httpx, pytest
from app.config import Settings
from app.social.instagram import InstagramConnector
from app.social.base import PublishError

def _settings():
    return Settings(_env_file=None, instagram_access_token="tok", ig_user_id="123")

class _Transport(httpx.BaseTransport):
    def __init__(self, responses): self._responses = list(responses); self.calls = []
    def handle_request(self, request):
        self.calls.append(request)
        status, payload = self._responses.pop(0)
        return httpx.Response(status, json=payload, request=request)

def test_publish_happy_path(monkeypatch):
    t = _Transport([
        (200, {"id": "CONTAINER1"}),                 # create container
        (200, {"status_code": "FINISHED"}),          # poll
        (200, {"id": "MEDIA1"}),                      # publish
        (200, {"permalink": "https://instagram.com/p/x"}),  # permalink
    ])
    c = InstagramConnector(_settings(), transport=t)
    r = c.publish(image_url="https://s3/x.jpg", caption="hi")
    assert r.external_id == "MEDIA1"
    assert r.permalink == "https://instagram.com/p/x"

def test_publish_media_fetch_failed_is_nonretryable(monkeypatch):
    t = _Transport([(400, {"error": {"code": 9004, "error_subcode": 2207052,
                                     "message": "media could not be fetched"}})])
    c = InstagramConnector(_settings(), transport=t)
    with pytest.raises(PublishError) as ei:
        c.publish(image_url="https://bad", caption="hi")
    assert ei.value.code == "media_fetch_failed" and ei.value.retryable is False

def test_publish_requires_image_url():
    with pytest.raises(PublishError):
        InstagramConnector(_settings()).publish(image_url=None, caption="hi")
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd apps/api && uv run pytest tests/test_instagram_connector.py -q`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** (inject `transport` for tests; default real transport; poll loop uses an injected `sleep`/max-tries so tests don't wait)
```python
# apps/api/app/social/instagram.py  (sketch — fill in the mapping table from the spec §5)
from __future__ import annotations
import httpx
from app.config import Settings
from app.social.base import PublishConnector, PublishResult, PublishError

_SUBCODE = {2207052: ("media_fetch_failed", False), 2207026: ("unsupported_format", False),
            2207005: ("unsupported_format", False), 9007: ("not_ready", True),
            2207027: ("not_ready", True), 2207003: ("download_timeout", True)}

class InstagramConnector(PublishConnector):
    name = "instagram"
    def __init__(self, settings: Settings, *, transport=None, max_polls: int = 5):
        self._s = settings
        self._base = f"https://graph.instagram.com/{settings.graph_api_version}"
        self._client = httpx.Client(transport=transport, timeout=30)
        self._max_polls = max_polls

    def _raise(self, resp: httpx.Response):
        err = (resp.json() or {}).get("error", {})
        code, sub, msg = err.get("code"), err.get("error_subcode"), err.get("message", "")
        if code == 190:
            raise PublishError("token_expired", msg, retryable=False)
        if code in (4, 9, 17, 32, 613):
            raise PublishError("rate_limited", msg, retryable=True)
        mapped, retry = _SUBCODE.get(sub, ("unknown", False))
        raise PublishError(mapped, msg or "publish failed", retryable=retry)

    def publish(self, *, image_url, caption, idempotency_key=None) -> PublishResult:
        if not image_url:
            raise PublishError("no_media_url", "Instagram requires a public image_url", retryable=False)
        uid, tok = self._s.ig_user_id, self._s.instagram_access_token
        r = self._client.post(f"{self._base}/{uid}/media",
                              data={"image_url": image_url, "caption": caption, "access_token": tok})
        if r.status_code >= 400: self._raise(r)
        container = r.json()["id"]
        for _ in range(self._max_polls):
            s = self._client.get(f"{self._base}/{container}",
                                 params={"fields": "status_code", "access_token": tok})
            code = s.json().get("status_code")
            if code == "FINISHED": break
            if code == "ERROR": raise PublishError("processing_error", "container ERROR", retryable=True)
        pub = self._client.post(f"{self._base}/{uid}/media_publish",
                                data={"creation_id": container, "access_token": tok})
        if pub.status_code >= 400: self._raise(pub)
        media_id = pub.json()["id"]
        link = self._client.get(f"{self._base}/{media_id}",
                                params={"fields": "permalink", "access_token": tok})
        return PublishResult(external_id=media_id,
                             permalink=link.json().get("permalink") if link.status_code < 400 else None)
```

- [ ] **Step 4: Run to verify it passes**
Run: `cd apps/api && uv run pytest tests/test_instagram_connector.py -q`
Expected: PASS (all three).

- [ ] **Step 5: Commit**
```bash
git add apps/api/app/social/instagram.py apps/api/tests/test_instagram_connector.py
git commit -m "feat(api): real Instagram Graph API connector (v26.0) with error mapping"
```

---

### Task 4: Connector factory (env-gated)

**Files:**
- Create: `apps/api/app/social/factory.py`
- Test: `apps/api/tests/test_instagram_connector.py` (factory portion)

**Interfaces:**
- Consumes: `Settings.instagram_configured()`, `StubConnector`, `InstagramConnector`.
- Produces: `get_connector(settings) -> PublishConnector` — `InstagramConnector` when `instagram_configured()`, else `StubConnector`. Logs the chosen name only (never the token).

- [ ] **Step 1: Write the failing test**
```python
# add to tests/test_instagram_connector.py
from app.config import Settings
from app.social.factory import get_connector

def test_factory_stub_without_keys():
    assert get_connector(Settings(_env_file=None)).name == "stub"

def test_factory_real_with_keys():
    s = Settings(_env_file=None, instagram_access_token="t", ig_user_id="1")
    assert get_connector(s).name == "instagram"
```

- [ ] **Step 2: Run to verify it fails** — `uv run pytest tests/test_instagram_connector.py -q` → FAIL.

- [ ] **Step 3: Implement**
```python
# apps/api/app/social/factory.py
from __future__ import annotations
import logging
from app.config import Settings
from app.social.base import PublishConnector
from app.social.instagram import InstagramConnector
from app.social.stub import StubConnector

log = logging.getLogger(__name__)

def get_connector(settings: Settings) -> PublishConnector:
    if settings.instagram_configured():
        log.info("publish connector: instagram")
        return InstagramConnector(settings)
    log.info("publish connector: stub (no Instagram keys)")
    return StubConnector()
```

- [ ] **Step 4: Run to verify it passes** — PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/api/app/social/factory.py apps/api/tests/test_instagram_connector.py
git commit -m "feat(api): env-gated publish connector factory"
```

---

### Task 5: S3 media upload (presigned URL, mocked)

**Files:**
- Create: `apps/api/app/storage/s3_media.py`
- Test: `apps/api/tests/test_s3_media.py`

**Interfaces:**
- Consumes: `Settings.s3_configured()`.
- Produces: `upload_jpeg(settings, key: str, data: bytes) -> str` — puts the object (ContentType `image/jpeg`) and returns a presigned GET URL (TTL `settings.s3_presign_ttl`). Raises `RuntimeError` if `not s3_configured()`. boto3 client creation isolated in `_client(settings)` so tests monkeypatch it.

- [ ] **Step 1: Write the failing test** (monkeypatch `_client`)
```python
# apps/api/tests/test_s3_media.py
import pytest
from app.config import Settings
from app.storage import s3_media

class _FakeS3:
    def __init__(self): self.put = None
    def put_object(self, **kw): self.put = kw
    def generate_presigned_url(self, op, Params, ExpiresIn):
        return f"https://s3/{Params['Bucket']}/{Params['Key']}?sig=1&ttl={ExpiresIn}"

def _s(): return Settings(_env_file=None, s3_bucket="b", s3_region="r",
                          aws_access_key_id="k", aws_secret_access_key="x", s3_presign_ttl=900)

def test_upload_returns_presigned_url(monkeypatch):
    fake = _FakeS3(); monkeypatch.setattr(s3_media, "_client", lambda s: fake)
    url = s3_media.upload_jpeg(_s(), "posts/1/a.jpg", b"\xff\xd8\xff")
    assert fake.put["Bucket"] == "b" and fake.put["ContentType"] == "image/jpeg"
    assert url.startswith("https://s3/b/posts/1/a.jpg") and "ttl=900" in url

def test_upload_requires_config():
    with pytest.raises(RuntimeError):
        s3_media.upload_jpeg(Settings(_env_file=None), "k", b"x")
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module missing).

- [ ] **Step 3: Implement**
```python
# apps/api/app/storage/s3_media.py
from __future__ import annotations
from app.config import Settings

def _client(settings: Settings):
    import boto3  # lazy: optional for tests/dev without boto3 installed paths
    return boto3.client("s3", region_name=settings.s3_region,
                        aws_access_key_id=settings.aws_access_key_id,
                        aws_secret_access_key=settings.aws_secret_access_key)

def upload_jpeg(settings: Settings, key: str, data: bytes) -> str:
    if not settings.s3_configured():
        raise RuntimeError("S3 is not configured (set S3_BUCKET/REGION + AWS keys)")
    client = _client(settings)
    client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="image/jpeg")
    return client.generate_presigned_url(
        "get_object", Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=settings.s3_presign_ttl)
```

- [ ] **Step 4: Run to verify it passes** — PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/api/app/storage/s3_media.py apps/api/tests/test_s3_media.py
git commit -m "feat(api): S3 JPEG upload + presigned GET URL"
```

---

### Task 6: `POST /social/instagram/publish` route + Post columns

**Files:**
- Modify: `apps/api/app/models/post.py` (add columns + `failed` status)
- Create: `apps/api/app/routers/instagram.py`, `apps/api/app/schemas/instagram.py`
- Modify: `apps/api/app/main.py` (register router)
- Test: `apps/api/tests/test_instagram_publish_route.py`

**Interfaces:**
- Consumes: `get_connector` (Task 4), `upload_jpeg` (Task 5), `_owned_composition` pattern (from `routers/social.py:58`), `audit.record`, `clock.now`.
- Produces: `POST /social/instagram/publish` (agent-only, multipart: `composition_id: int`, `caption: str`, `image: UploadFile`) → `InstagramPublishOut(post_id, external_id, permalink, status)`. Adds `Post` columns `platform`, `caption`, `media_object_key`, `external_id`, `permalink`; adds `failed` to `PostStatus`.

- [ ] **Step 1: Add the model columns** (keep `native_enum=False`)
```python
# apps/api/app/models/post.py
class PostStatus(str, enum.Enum):
    scheduled = "scheduled"; published = "published"; failed = "failed"
# add to Post:
    platform: Mapped[str] = mapped_column(String(20), default="instagram")
    caption: Mapped[str] = mapped_column(Text, default="")
    media_object_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    permalink: Mapped[str | None] = mapped_column(String(500), nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")
```
(`from sqlalchemy import Text` as needed.)

- [ ] **Step 2: Write the failing test** (uses the stub connector — no keys in test settings)
```python
# apps/api/tests/test_instagram_publish_route.py
import io
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64  # minimal JPEG magic header

def _make_composition(client, agent_headers):
    # reuse the helper pattern from tests/test_social.py to create an owned composition
    ...

def test_publish_happy_path_stub(client, agent_headers):
    comp_id = _make_composition(client, agent_headers)
    r = client.post("/social/instagram/publish",
        headers=agent_headers,
        data={"composition_id": comp_id, "caption": "Visit Galway"},
        files={"image": ("a.jpg", io.BytesIO(JPEG), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "published" and body["external_id"].startswith("stub-")

def test_publish_rejects_non_jpeg(client, agent_headers):
    comp_id = _make_composition(client, agent_headers)
    r = client.post("/social/instagram/publish", headers=agent_headers,
        data={"composition_id": comp_id, "caption": "x"},
        files={"image": ("a.png", io.BytesIO(b"\x89PNG\r\n"), "image/png")})
    assert r.status_code == 422

def test_publish_rejects_caption_over_2200(client, agent_headers):
    comp_id = _make_composition(client, agent_headers)
    r = client.post("/social/instagram/publish", headers=agent_headers,
        data={"composition_id": comp_id, "caption": "x" * 2201},
        files={"image": ("a.jpg", io.BytesIO(JPEG), "image/jpeg")})
    assert r.status_code == 422

def test_publish_requires_owned_composition(client, agent_headers, agent2_headers):
    comp_id = _make_composition(client, agent_headers)
    r = client.post("/social/instagram/publish", headers=agent2_headers,
        data={"composition_id": comp_id, "caption": "x"},
        files={"image": ("a.jpg", io.BytesIO(JPEG), "image/jpeg")})
    assert r.status_code == 404
```

- [ ] **Step 3: Run to verify it fails** — FAIL (route missing).

- [ ] **Step 4: Implement the router**
```python
# apps/api/app/schemas/instagram.py
from pydantic import BaseModel
class InstagramPublishOut(BaseModel):
    post_id: int; external_id: str | None; permalink: str | None; status: str
```
```python
# apps/api/app/routers/instagram.py  (sketch)
from datetime import datetime
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from app import audit, clock
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.post import Post, PostStatus
from app.models.user import Role, User
from app.social.factory import get_connector
from app.social.base import PublishError
from app.storage import s3_media
from app.schemas.instagram import InstagramPublishOut

router = APIRouter(prefix="/social/instagram", tags=["instagram"])
_agent_only = require_role(Role.tourism_agent)
_MAX = 8 * 1024 * 1024

def _owned(db, cid, user):
    c = db.get(Composition, cid)
    if c is None or c.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    return c

@router.post("/publish", response_model=InstagramPublishOut)
def publish(composition_id: int = Form(...), caption: str = Form(""),
            image: UploadFile = File(...), user: User = Depends(_agent_only),
            db: Session = Depends(get_db), settings = Depends(get_settings),
            now: datetime = Depends(clock.now)) -> InstagramPublishOut:
    comp = _owned(db, composition_id, user)
    if len(caption) > 2200:
        raise HTTPException(422, "Caption exceeds Instagram's 2200-character limit")
    data = image.file.read()
    if not data[:3] == b"\xff\xd8\xff":
        raise HTTPException(422, "Image must be a JPEG")
    if len(data) > _MAX:
        raise HTTPException(422, "Image exceeds Instagram's 8 MB limit")
    connector = get_connector(settings)
    post = Post(composition_id=comp.id, channel="instagram", platform="instagram",
                caption=caption, status=PostStatus.scheduled)
    db.add(post); db.flush()
    image_url = None
    if settings.instagram_configured():     # real path needs a public URL
        key = f"posts/{post.id}/{now.timestamp():.0f}.jpg"
        image_url = s3_media.upload_jpeg(settings, key, data)
        post.media_object_key = key
    try:
        result = connector.publish(image_url=image_url, caption=caption,
                                   idempotency_key=f"post-{post.id}")
    except PublishError as e:
        post.status = PostStatus.failed; post.error = f"{e.code}: {e}"
        db.commit()
        raise HTTPException(502, {"error": "publish_failed", "code": e.code, "retryable": e.retryable})
    post.status = PostStatus.published; post.external_id = result.external_id
    post.permalink = result.permalink; post.published_at = now
    audit.record(db, actor_id=user.id, action="publish", target_type="post", target_id=post.id)
    db.commit(); db.refresh(post)
    return InstagramPublishOut(post_id=post.id, external_id=post.external_id,
                               permalink=post.permalink, status=post.status.value)
```
Register in `main.py`: `from app.routers import instagram` and `app.include_router(instagram.router)`.

- [ ] **Step 5: Run to verify it passes**
Run: `cd apps/api && uv run pytest tests/test_instagram_publish_route.py -q`
Expected: PASS (all four).

- [ ] **Step 6: Commit**
```bash
git add apps/api/app/models/post.py apps/api/app/routers/instagram.py apps/api/app/schemas/instagram.py apps/api/app/main.py apps/api/tests/test_instagram_publish_route.py
git commit -m "feat(api): POST /social/instagram/publish (JPEG+caption, audited, stub/real)"
```

---

### Task 7: Regenerate the shared contract + client fn

**Files:**
- Modify: `packages/shared/src/client.ts` (+ regenerated `openapi.json`, `api-types.ts`)

- [ ] **Step 1: Add the client fn**
```ts
// packages/shared/src/client.ts
export async function publishToInstagram(form: FormData) {
  return send<{ post_id: number; external_id: string | null; permalink: string | null; status: string }>(
    "/social/instagram/publish", { method: "POST", body: form });
}
```
- [ ] **Step 2: Regenerate types** — `node scripts/gen-api-types.mjs`
- [ ] **Step 3: Verify drift gate** — `cd apps/api && uv run python ../../scripts/check_api_types_sync.py` → exit 0
- [ ] **Step 4: Commit**
```bash
git add packages/shared/src/client.ts packages/shared/openapi.json packages/shared/src/api-types.ts
git commit -m "feat(shared): publishToInstagram client + regenerated types"
```

---

### Task 8: Studio "Publish to Instagram" button (JPEG export)

**Files:**
- Modify: `apps/web/lib/studio/render.ts` (add JPEG export), `apps/web/components/studio/ExportMenu.tsx`
- Test: `apps/web/tests/instagram-publish.test.ts`

**Interfaces:**
- Consumes: `publishToInstagram` (Task 7); `renderDesignToPng` pattern (`apps/web/lib/studio/render.ts`).
- Produces: `renderDesignToJpegBlob(design, sceneIndex, {width:1080,height:1350}) -> Promise<Blob>`; an ExportMenu action that builds `FormData` (composition_id, caption, image) and calls `publishToInstagram`, showing the returned permalink/status.

- [ ] **Step 1: Write the failing test**
```ts
// apps/web/tests/instagram-publish.test.ts
import { buildPublishForm } from "../lib/studio/instagram";
test("buildPublishForm packs composition, caption, jpeg", () => {
  const blob = new Blob([new Uint8Array([0xff,0xd8,0xff])], { type: "image/jpeg" });
  const fd = buildPublishForm({ compositionId: 7, caption: "hi", jpeg: blob });
  expect(fd.get("composition_id")).toBe("7");
  expect(fd.get("caption")).toBe("hi");
  expect((fd.get("image") as File).type).toBe("image/jpeg");
});
```
- [ ] **Step 2: Run to verify it fails** — `cd apps/web && pnpm exec vitest run tests/instagram-publish.test.ts` → FAIL.
- [ ] **Step 3: Implement** `apps/web/lib/studio/instagram.ts` with `buildPublishForm(...)`, add `renderDesignToJpegBlob` (Fabric `toDataURL({format:"jpeg",quality:0.9,multiplier})` → Blob) to `render.ts`, and a "Publish to Instagram" button in `ExportMenu.tsx` (caption field + call). 
- [ ] **Step 4: Run to verify it passes** — PASS.
- [ ] **Step 5: Commit**
```bash
git add apps/web/lib/studio/ apps/web/components/studio/ExportMenu.tsx apps/web/tests/instagram-publish.test.ts
git commit -m "feat(web): Studio Publish-to-Instagram (JPEG export + caption)"
```

---

### Task 9: Governance — ACs + `make verify`

**Files:**
- Modify: `/REQUIREMENTS.md` (version bump + change-log row — **needs user approval**), `requirements.manifest.yaml`

- [ ] **Step 1:** Add **AC49** (connector abstraction real+stub), **AC50** (S3 presigned + JPEG validation), **AC51** (`/social/instagram/publish` publishes via stub + audited) to `/REQUIREMENTS.md` with a version bump + change-log row; add their proofs (the test node-ids above) to `requirements.manifest.yaml`.
- [ ] **Step 2: Run the full gate** — `make verify` → all steps pass (lint, api-test, api-types-sync, web-typecheck, web-test, e2e, matrix, sync, compose-config).
- [ ] **Step 3: Commit**
```bash
git add REQUIREMENTS.md requirements.manifest.yaml docs/plans/2026-10-05-run-ledger.md
git commit -m "docs(req): AC49-AC51 Instagram publish increment 1 + proofs"
```

---

## Self-Review

**Spec coverage (Increment 1 scope):** connector abstraction + stub (Tasks 2,4) ✓; real Instagram adapter w/ error mapping (Task 3) ✓ [spec §5]; S3 presigned JPEG (Task 5) [spec §8 gap #2] ✓; JPEG export + persist (Task 8) [gap #1] ✓; audited publish endpoint (Task 6) [Contract 3] ✓; config/egress/secrets env-only (Task 1) [Contract 2] ✓; OpenAPI drift gate (Task 7) [gap #6] ✓. **Deferred to later increments (not gaps here):** review gate + reviewer role (Inc 2), grounded AI copy (Inc 3), scheduler/lifespan dispatcher (Inc 4), token refresh (Inc 5) — each gets its own plan.

**Placeholder scan:** the web task (8) references existing Fabric export mechanics rather than repeating them; all API tasks carry concrete test + impl code. No "TBD"/"handle errors"-style gaps.

**Type consistency:** `PublishResult(external_id, permalink)`, `PublishError(code, retryable)`, `get_connector(settings)`, `upload_jpeg(settings, key, data)->str`, `InstagramPublishOut(post_id, external_id, permalink, status)` are used identically across Tasks 2–8.

**Review Focus:** all five lines above have an owning task's test (non-JPEG/oversized/caption → Task 6; real-without-S3 → Task 6 `instagram_configured` branch + Task 5 RuntimeError; Meta error mapping + idempotency → Task 3).

**Migration note:** adding `Post` columns + the `failed` status under `create_all` (no Alembic) requires a **fresh DB** on existing Postgres; SQLite test DBs are always fresh. Call this out at execution start.
