"""Studio agentic-ops facade — access-token auth + Contract 1 grounding over the Node engine.

The Node engine is stubbed (no network); these assert the FACADE's job: role auth, and resolving the
caller's item_ids through the visibility choke-point into the approved ids + real image refs it
hands the engine (so an unapproved/hidden item can never reach it).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role
from app.routers import studio as studio_router
from tests.conftest import auth_header

_DESIGN = {
    "format": "social",
    "width": 1080,
    "height": 1080,
    "scenes": [
        {"id": "s1", "name": "Scene 1", "durationMs": 4000, "transition": "none", "nodes": []}
    ],
}


def _seed(app, title, *, approved=True, safe=True, cover="", tenants=None, agents=None) -> int:
    with app.state.sessionmaker() as db:
        e = CatalogEntry(
            type=CatalogType.event,
            title=title,
            description="",
            destination="Testshire",
            status=EntryStatus.approved if approved else EntryStatus.draft,
            brand_safe=safe,
            cover_object_key=cover,
            allowed_tenant_ids=tenants or [],
            allowed_agent_ids=agents or [],
            provider_id=1,
        )
        db.add(e)
        db.commit()
        return e.id


@pytest.fixture
def stub_node(monkeypatch):
    """Replace the Node engine transport with a recording stub (no network)."""
    seen: dict = {}

    def fake_post(path, payload):
        seen["post"] = (path, payload)
        return {
            "design": payload["design"],
            "results": [{"op": c.get("op", "?"), "status": "applied"} for c in payload["calls"]],
            "valid": True,
        }

    def fake_get(path):
        seen["get"] = path
        return {"ops": [{"op": "place", "description": "place an item", "params": {}}]}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    monkeypatch.setattr(studio_router, "_node_get", fake_get)
    return seen


def test_studio_ops_spec_is_agent_only(app, stub_node):
    with TestClient(app) as c:
        provider = auth_header(c, Role.content_provider)
        assert c.get("/ai-agent/studio/ops/spec").status_code == 401
        assert c.get("/ai-agent/studio/ops/spec", headers=provider).status_code == 403
        r = c.get("/ai-agent/studio/ops/spec", headers=auth_header(c, Role.tourism_agent))
        assert r.status_code == 200
        assert any(o["op"] == "place" for o in r.json()["ops"])


def test_studio_ops_apply_is_agent_only(app, stub_node):
    body = {"design": _DESIGN, "calls": [], "item_ids": []}
    with TestClient(app) as c:
        provider = auth_header(c, Role.content_provider)
        agent = auth_header(c, Role.tourism_agent)
        assert c.post("/ai-agent/studio/ops/apply", json=body).status_code == 401
        assert c.post("/ai-agent/studio/ops/apply", json=body, headers=provider).status_code == 403
        assert c.post("/ai-agent/studio/ops/apply", json=body, headers=agent).status_code == 200


def test_studio_ops_apply_grounds_item_ids_through_visibility(app, stub_node):
    ok = _seed(app, "Visible Tour", cover="assets/ok.png")
    draft = _seed(app, "Draft Secret", approved=False)
    unsafe = _seed(app, "Unsafe Secret", safe=False)
    bogus = 987654
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/ops/apply",
            headers=agent,
            json={
                "design": _DESIGN,
                "scene_index": 0,
                "calls": [{"op": "place", "item_id": ok}],
                "item_ids": [ok, draft, unsafe, bogus],
            },
        )
        assert r.status_code == 200
        path, payload = stub_node["post"]
        assert path == "/api/studio-ops/apply"
        # Only the visible id reaches the engine, with its real image ref — hidden ids are dropped.
        assert payload["allowedCatalogIds"] == [str(ok)]
        assert payload["imageSrcById"] == {str(ok): "assets/ok.png"}
        for hidden in (draft, unsafe, bogus):
            assert str(hidden) not in payload["allowedCatalogIds"]
        assert payload["calls"] == [{"op": "place", "item_id": ok}]
        assert payload["sceneIndex"] == 0


def test_studio_ops_apply_omits_image_ref_when_no_cover(app, stub_node):
    # An approved item with no image → an allowed id but NO src (so `place` can't fabricate one).
    noimg = _seed(app, "No Image Tour", cover="")
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        c.post(
            "/ai-agent/studio/ops/apply",
            headers=agent,
            json={"design": _DESIGN, "calls": [], "item_ids": [noimg]},
        )
        _, payload = stub_node["post"]
        assert payload["allowedCatalogIds"] == [str(noimg)]
        assert payload["imageSrcById"] == {}
