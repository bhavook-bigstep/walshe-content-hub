"""Campaign post approval + live publish (Increment 2, AC78/AC79).

Self-approval by the owning agent (a deliberate PoC exception to approver != owner), then a live
Instagram publish that runs on the stub connector in tests (no keys -> no egress, deterministic).
"""

import io

from app.models.audit import AuditLog
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.user import Role, User
from tests.conftest import auth_header

JPEG = b"\xff\xd8\xff" + b"\x00" * 64  # minimal "JPEG" (magic bytes + filler)


def _agent_id(client, email="agent@test.local") -> int:
    with client.app.state.sessionmaker() as db:
        return db.query(User).filter_by(email=email).one().id


def _campaign(client, headers) -> int:
    return client.post("/campaigns", json={
        "name": "Aus", "starts_on": "2026-08-01", "ends_on": "2026-08-31",
    }, headers=headers).json()["id"]


def _empty_composition(client) -> int:
    with client.app.state.sessionmaker() as db:
        comp = Composition(agent_id=_agent_id(client), format="social", item_ids=[])
        db.add(comp)
        db.commit()
        db.refresh(comp)
        return comp.id


def _approved_composition(client) -> int:
    """A composition that passes preflight: one approved, brand-safe catalog item."""
    with client.app.state.sessionmaker() as db:
        provider = db.query(User).filter_by(email="provider@test.local").one()
        agent = db.query(User).filter_by(email="agent@test.local").one()
        entry = CatalogEntry(type=CatalogType.place, title="Cliffs", destination="Clare",
                             status=EntryStatus.approved, brand_safe=True, provider_id=provider.id)
        db.add(entry)
        db.flush()
        comp = Composition(agent_id=agent.id, format="social", item_ids=[entry.id])
        db.add(comp)
        db.commit()
        db.refresh(comp)
        return comp.id


def _unapproved_composition(client) -> int:
    with client.app.state.sessionmaker() as db:
        provider = db.query(User).filter_by(email="provider@test.local").one()
        agent = db.query(User).filter_by(email="agent@test.local").one()
        bad = CatalogEntry(type=CatalogType.place, title="Draft", destination="Clare",
                           status=EntryStatus.draft, brand_safe=False, provider_id=provider.id)
        db.add(bad)
        db.flush()
        comp = Composition(agent_id=agent.id, format="social", item_ids=[bad.id])
        db.add(comp)
        db.commit()
        db.refresh(comp)
        return comp.id


def _schedule(client, headers, cid, comp_id, scheduled_at="2026-08-15T15:00:00+05:30"):
    return client.post(f"/campaigns/{cid}/posts",
                       data={"composition_id": str(comp_id), "caption": "Hello",
                             "scheduled_at": scheduled_at},
                       files={"image": ("post.jpg", io.BytesIO(JPEG), "image/jpeg")},
                       headers=headers)


def _schedule_id(client, headers, comp_factory):
    cid = _campaign(client, headers)
    comp = comp_factory(client)
    r = _schedule(client, headers, cid, comp)
    assert r.status_code == 201, r.text
    return cid, r.json()["id"]


def test_approve_publishes_immediately(client):
    # Approve IS the publish decision: one call records the reviewer AND posts (stub) immediately.
    a = auth_header(client, Role.tourism_agent)
    cid, pid = _schedule_id(client, a, _approved_composition)
    r = client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "published"
    assert body["external_id"].startswith("stub-")
    assert body["approved_by"]  # reviewer recorded
    with client.app.state.sessionmaker() as db:
        assert db.query(AuditLog).filter_by(action="approve", target_type="post").count() == 1
        assert db.query(AuditLog).filter_by(action="publish", target_type="post").count() == 1


def test_approve_blocked_by_preflight_stays_pending(client):
    # Unapproved content can't reach Instagram (Contract 1 / AC6); approval is refused and the post
    # stays pending_approval so it can be fixed and re-approved.
    a = auth_header(client, Role.tourism_agent)
    cid = _campaign(client, a)
    comp = _unapproved_composition(client)
    pid = _schedule(client, a, cid, comp).json()["id"]
    r = client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["error"] == "preflight_failed"
    detail = client.get(f"/campaigns/{cid}", headers=a).json()
    assert detail["posts"][0]["status"] == "pending_approval"


def test_reject_sets_rejected_with_note(client):
    a = auth_header(client, Role.tourism_agent)
    cid, pid = _schedule_id(client, a, _empty_composition)
    r = client.post(f"/campaigns/{cid}/posts/{pid}/reject", data={"note": "off-brand"}, headers=a)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert r.json()["review_note"] == "off-brand"


def test_cannot_approve_a_non_pending_post(client):
    a = auth_header(client, Role.tourism_agent)
    cid, pid = _schedule_id(client, a, _approved_composition)
    first = client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a)
    assert first.status_code == 200, first.text  # approved + published
    # already published -> a second approve is a 409, not a re-publish
    assert client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a).status_code == 409


def test_second_agent_cannot_approve_foreign_post(client, second_agent_headers):
    a = auth_header(client, Role.tourism_agent)
    cid, pid = _schedule_id(client, a, _approved_composition)
    r = client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=second_agent_headers)
    assert r.status_code == 404, r.text  # agent2 does not own the campaign
    # ...but the owner can (proves the 404 above is authz, not a missing route).
    assert client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a).status_code == 200


def test_approve_with_missing_capture_is_graceful_409(client):
    # A restarted in-memory store loses captured bytes; approve must 409 cleanly, not 500.
    a = auth_header(client, Role.tourism_agent)
    cid, pid = _schedule_id(client, a, _approved_composition)
    client.app.state.storage._objects.clear()
    r = client.post(f"/campaigns/{cid}/posts/{pid}/approve", headers=a)
    assert r.status_code == 409, r.text
    assert "no longer available" in r.text.lower()
