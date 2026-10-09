"""Task 6 — POST /social/instagram/publish. Stub connector, clock injected, hermetic."""

from __future__ import annotations

import io
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import app.models.post  # noqa: F401 - register table before create_all
from app import clock
from app.config import Settings
from app.main import create_app
from app.models.audit import AuditLog
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.user import Role, User
from app.security import hash_password

FIXED = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
JPEG = b"\xff\xd8\xff\xe0" + b"0" * 64  # minimal JPEG magic header + filler
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32

AGENT1 = ("agent@test.local", "test-pass-agent")
AGENT2 = ("agent2@test.local", "test-pass-agent2")
PROVIDER = ("provider@test.local", "test-pass-prov")


def _seed_db(application) -> None:
    """agent1 + agent2 + provider + one approved brand-safe composition (id 1), owned by agent1."""
    with application.state.sessionmaker() as db:
        db.add(User(email=AGENT1[0], password_hash=hash_password(AGENT1[1]),
                    role=Role.tourism_agent, tenant_id=1, approved=True))
        db.add(User(email=AGENT2[0], password_hash=hash_password(AGENT2[1]),
                    role=Role.tourism_agent, tenant_id=1, approved=True))
        db.add(User(email=PROVIDER[0], password_hash=hash_password(PROVIDER[1]),
                    role=Role.content_provider, tenant_id=1, approved=True))
        db.flush()
        provider = db.scalars(select(User).where(User.role == Role.content_provider)).one()
        agent1 = db.scalars(select(User).where(User.email == AGENT1[0])).one()
        entry = CatalogEntry(type=CatalogType.place, title="Cliffs", destination="Clare",
                             status=EntryStatus.approved, brand_safe=True, provider_id=provider.id)
        db.add(entry)
        db.flush()
        db.add(Composition(agent_id=agent1.id, format="social", item_ids=[entry.id]))
        db.commit()


@pytest.fixture
def igclient(settings):
    # create_app already mounts the instagram router; no re-include needed.
    application = create_app(settings)
    application.dependency_overrides[clock.now] = lambda: FIXED
    _seed_db(application)
    with TestClient(application) as c:
        c.app_ = application
        yield c


def _live_settings(tmp_path, *, s3=False) -> Settings:
    """Settings with Instagram configured (live connector path), optionally with S3 configured."""
    over: dict = {"instagram_access_token": "tok", "ig_user_id": "123"}
    if s3:
        over |= {"s3_bucket": "b", "s3_region": "us-east-1",
                 "aws_access_key_id": "k", "aws_secret_access_key": "x"}
    return Settings(_env_file=None, database_url=f"sqlite+pysqlite:///{tmp_path}/live.db",
                    jwt_secret="test-secret-fixed", **over)


def _live_application(tmp_path, *, s3=False):
    application = create_app(_live_settings(tmp_path, s3=s3))
    application.dependency_overrides[clock.now] = lambda: FIXED
    _seed_db(application)
    return application


def _headers(c, creds):
    resp = c.post("/auth/login", json={"email": creds[0], "password": creds[1]})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _files(data=JPEG, name="a.jpg", ctype="image/jpeg"):
    return {"image": (name, io.BytesIO(data), ctype)}


def test_publish_happy_path_stub(igclient):
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": 1, "caption": "Visit Galway"}, files=_files())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["external_id"].startswith("stub-")
    # audited (Contract 3)
    with igclient.app_.state.sessionmaker() as db:
        row = db.scalars(select(AuditLog)).one()
        assert (row.action, row.target_type) == ("publish", "post")


def test_publish_accepts_image_url_without_file(igclient):
    # Verification path: a pre-hosted public image URL posts end-to-end with no upload / no S3.
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": 1, "caption": "hosted", "image_url": "https://x/y.jpg"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"


def test_publish_requires_image_or_url(igclient):
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": 1, "caption": "nothing"})
    assert r.status_code == 422


def test_publish_rejects_non_jpeg(igclient):
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": 1, "caption": "x"},
                      files=_files(PNG, "a.png", "image/png"))
    assert r.status_code == 422


def test_publish_rejects_caption_over_2200(igclient):
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": 1, "caption": "x" * 2201}, files=_files())
    assert r.status_code == 422


def test_publish_requires_owned_composition(igclient):
    h2 = _headers(igclient, AGENT2)  # agent2 does not own composition 1
    r = igclient.post("/social/instagram/publish", headers=h2,
                      data={"composition_id": 1, "caption": "x"}, files=_files())
    assert r.status_code == 404


def test_publish_is_agent_only(igclient):
    hp = _headers(igclient, PROVIDER)
    r = igclient.post("/social/instagram/publish", headers=hp,
                      data={"composition_id": 1, "caption": "x"}, files=_files())
    assert r.status_code == 403


# ── Gap fixes: Contract 1 on the live path, no double-publish, live-mode guards ──────────────────

def test_publish_blocked_by_preflight_when_item_unapproved(igclient):
    """Contract 1 / AC6: a design built from unapproved content must not reach the account."""
    with igclient.app_.state.sessionmaker() as db:
        agent1 = db.scalars(select(User).where(User.email == AGENT1[0])).one()
        provider = db.scalars(select(User).where(User.role == Role.content_provider)).one()
        bad = CatalogEntry(type=CatalogType.place, title="Draft", destination="Clare",
                           status=EntryStatus.draft, brand_safe=False, provider_id=provider.id)
        db.add(bad)
        db.flush()
        comp = Composition(agent_id=agent1.id, format="social", item_ids=[bad.id])
        db.add(comp)
        db.flush()
        cid = comp.id
        db.commit()
    h = _headers(igclient, AGENT1)
    r = igclient.post("/social/instagram/publish", headers=h,
                      data={"composition_id": cid, "caption": "x"}, files=_files())
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "preflight_failed"


def test_publish_same_composition_twice_conflicts(igclient):
    """A second publish of an already-published composition is a 409, not a duplicate live post."""
    h = _headers(igclient, AGENT1)
    first = igclient.post("/social/instagram/publish", headers=h,
                          data={"composition_id": 1, "caption": "x"}, files=_files())
    assert first.status_code == 200, first.text
    second = igclient.post("/social/instagram/publish", headers=h,
                           data={"composition_id": 1, "caption": "x"}, files=_files())
    assert second.status_code == 409, second.text


def test_publish_live_rejects_prehosted_image_url(tmp_path, monkeypatch):
    """In live mode an arbitrary pre-hosted image_url is rejected (render+upload path only)."""
    from app.social import publish as publish_svc
    from app.social.stub import StubConnector

    # If the gate failed to fire we'd publish via the stub (200) rather than hit the network.
    monkeypatch.setattr(publish_svc, "get_connector", lambda s: StubConnector())
    application = _live_application(tmp_path)
    with TestClient(application) as c:
        h = _headers(c, AGENT1)
        r = c.post("/social/instagram/publish", headers=h,
                   data={"composition_id": 1, "caption": "x", "image_url": "https://x/y.jpg"})
    assert r.status_code == 422, r.text
    assert "pre-hosted" in r.text.lower()


def test_publish_live_upload_without_s3_returns_503(tmp_path, monkeypatch):
    """IG configured but S3 not → a clear 503, not a raw 500 from the storage layer."""
    from app.social import publish as publish_svc
    from app.social.stub import StubConnector

    monkeypatch.setattr(publish_svc, "get_connector", lambda s: StubConnector())
    application = _live_application(tmp_path, s3=False)
    with TestClient(application) as c:
        h = _headers(c, AGENT1)
        r = c.post("/social/instagram/publish", headers=h,
                   data={"composition_id": 1, "caption": "x"}, files=_files())
    assert r.status_code == 503, r.text
    assert "s3" in r.text.lower() or "hosting" in r.text.lower()
