"""Schedule-into-campaign + edit/reschedule (Inc 1 Tasks 5-6)."""

import io

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
