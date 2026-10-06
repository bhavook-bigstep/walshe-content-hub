"""Schedule-into-campaign + edit/reschedule (Inc 1 Tasks 5-6)."""

import io
from datetime import datetime, timezone

import pytest

from app.models.composition import Composition
from app.models.user import Role, User
from tests.conftest import auth_header

JPEG = b"\xff\xd8\xff" + b"\x00" * 64  # minimal "JPEG" (magic bytes + filler)


def _agent_id(client) -> int:
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        return db.query(User).filter_by(email="agent@test.local").one().id


def _make_composition(client) -> int:
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        comp = Composition(agent_id=_agent_id(client), format="social", item_ids=[])
        db.add(comp)
        db.commit()
        db.refresh(comp)
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


def test_scheduled_at_returned_as_utc_aware_instant(client):
    # SQLite drops tzinfo; if the API returns a NAIVE string the browser reads it as local time and
    # buckets the post on the wrong calendar day. The output must carry an explicit UTC offset.
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    # 16 Aug 02:00 +05:30 == 15 Aug 20:30 UTC
    r = _schedule(client, a, cid, comp, scheduled_at="2026-08-16T02:00:00+05:30")
    returned = r.json()["scheduled_at"]
    parsed = datetime.fromisoformat(returned)
    assert parsed.utcoffset() is not None, f"naive {returned!r}: browser reads it as local"
    assert parsed == datetime(2026, 8, 15, 20, 30, tzinfo=timezone.utc)


def test_schedule_accepts_platform_and_rejects_unsupported(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    ok = client.post(f"/campaigns/{cid}/posts",
                     data={"composition_id": str(comp), "caption": "x", "platform": "instagram"},
                     files={"image": ("p.jpg", io.BytesIO(JPEG), "image/jpeg")}, headers=a)
    assert ok.status_code == 201 and ok.json()["platform"] == "instagram"
    bad = client.post(f"/campaigns/{cid}/posts",
                      data={"composition_id": str(comp), "caption": "x", "platform": "tiktok"},
                      files={"image": ("p.jpg", io.BytesIO(JPEG), "image/jpeg")}, headers=a)
    assert bad.status_code == 422


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


# ---- Task 6: PATCH edit / reschedule ----
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


def test_patch_empty_caption_clears_caption(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    # An empty multipart value is indistinguishable from an absent one in FastAPI's Form, so
    # clearing uses the explicit clear_caption flag (mirrors unschedule).
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"clear_caption": "true"}, headers=a)
    assert r.status_code == 200 and r.json()["caption"] == ""


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


@pytest.mark.parametrize("state", ["published", "approved", "publishing", "cancelled"])
def test_patch_blocked_on_non_editable_status(client, state):
    from app.models.post import Post, PostStatus
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        p = db.get(Post, pid)
        p.status = PostStatus(state)
        db.commit()
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={"caption": "x"}, headers=a)
    assert r.status_code == 409


def test_patch_empty_is_422(client):
    a = auth_header(client, Role.tourism_agent)
    cid, comp = _campaign(client, a), _make_composition(client)
    pid = _post_id(client, a, cid, comp)
    r = client.patch(f"/campaigns/{cid}/posts/{pid}", data={}, headers=a)
    assert r.status_code == 422


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
