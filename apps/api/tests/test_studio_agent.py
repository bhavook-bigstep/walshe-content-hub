"""Studio Builder agent — endpoint contracts: deterministic stub, grounding, sprites, plan, stream.

The live loop runs in ``app.ai.studio_graph`` (a LangGraph ReAct agent, verified separately); these
tests lock down the server contracts that hold regardless of the loop: RBAC (agent-only), the
deterministic stub path when no key is set (Contract 4), grounding through the facade (only the
agent's visible catalog ids + real image srcs reach the Node engine — Contract 1), sprite
persistence, the plan endpoint, and the SSE stream shape. The Node engine is stubbed (no network).
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role
from app.routers import studio as studio_router
from tests.conftest import auth_header

_SPEC = [
    {"op": "write-copy", "description": "add a text caption", "params": {"text": "string"}},
    {"op": "place", "description": "place an approved catalog image", "params": {"item_id": "int"}},
    {"op": "set-background", "description": "set scene bg colour", "params": {"color": "hex"}},
]

_DESIGN = {
    "format": "social",
    "width": 1080,
    "height": 1080,
    "scenes": [
        {"id": "s1", "name": "Scene 1", "durationMs": 4000, "transition": "none", "nodes": []}
    ],
}


# ── Endpoint: deterministic stub + grounding ──────────────────────────────────────────────────────
@pytest.fixture
def stub_node(monkeypatch):
    seen: dict = {}

    def fake_post(path, payload):
        seen[path] = payload
        seen["post"] = (path, payload)
        if path.endswith("/observe"):
            return {"scenes": [{"index": 0, "name": "Scene 1", "description": "stub observation"}]}
        new = dict(payload["design"])
        new["_applied"] = len(payload["calls"])
        return {
            "design": new,
            "results": [{"op": c.get("op", "?"), "status": "applied"} for c in payload["calls"]],
            "valid": True,
        }

    def fake_get(path):
        return {"ops": _SPEC}

    monkeypatch.setattr(studio_router, "_node_post", fake_post)
    monkeypatch.setattr(studio_router, "_node_get", fake_get)
    return seen


def _seed(app, title, *, cover="assets/ok.png") -> int:
    with app.state.sessionmaker() as db:
        e = CatalogEntry(
            type=CatalogType.event, title=title, description="", destination="Testshire",
            status=EntryStatus.approved, brand_safe=True, cover_object_key=cover,
            allowed_tenant_ids=[], allowed_agent_ids=[], provider_id=1,
        )
        db.add(e)
        db.commit()
        return e.id


def test_agent_endpoint_is_agent_only(app, stub_node):
    body = {"design": _DESIGN, "prompt": "Promote it", "item_ids": []}
    with TestClient(app) as c:
        assert c.post("/ai-agent/studio/agent", json=body).status_code == 401
        provider = auth_header(c, Role.content_provider)
        assert c.post("/ai-agent/studio/agent", json=body, headers=provider).status_code == 403
        agent = auth_header(c, Role.tourism_agent)
        assert c.post("/ai-agent/studio/agent", json=body, headers=agent).status_code == 200


def test_observe_endpoint_labels_images_by_catalog_title(app, stub_node):
    ok = _seed(app, "Visible Tour")
    with TestClient(app) as c:
        assert c.post("/ai-agent/studio/ops/observe", json={"design": _DESIGN}).status_code == 401
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/ops/observe",
            headers=agent,
            json={"design": _DESIGN, "item_ids": [ok]},
        )
        assert r.status_code == 200
        assert r.json()["scenes"][0]["description"] == "stub observation"
        # The engine was handed id→title labels (so images read by name, not "catalog item N").
        payload = stub_node["/api/studio-ops/observe"]
        assert payload["labelsById"] == {str(ok): "Visible Tour"}


def test_generate_sprite_endpoint_persists_an_owner_sprite(app):
    # No image key in tests → the deterministic stub yields a single-frame solid sprite (hermetic).
    url = "/ai-agent/studio/sprites/generate"
    body = {"concept": "a walking fox"}
    with TestClient(app) as c:
        assert c.post(url, json=body).status_code == 401
        provider = auth_header(c, Role.content_provider)
        assert c.post(url, json=body, headers=provider).status_code == 403
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(url, json=body, headers=agent)
        assert r.status_code == 200
        data = r.json()
        assert data["ref"] == f"user:{data['sprite']['id']}"
        assert data["provider"] == "stub"
        assert len(data["sprite"]["frame_keys"]) == 4  # one image per motion frame (default N=4)
        # The generated sprite now appears in the caller's sprite library.
        listed = c.get("/me/sprites", headers=agent).json()
        assert any(s["id"] == data["sprite"]["id"] for s in listed)


def test_agent_endpoint_stub_is_deterministic_and_grounded(app, stub_node):
    ok = _seed(app, "Visible Tour")
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/ai-agent/studio/agent",
            headers=agent,
            json={"design": _DESIGN, "prompt": "Promote the tour", "item_ids": [ok]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["provider"] == "stub" and data["finished"] is True and data["applied"] == 1
        assert [s["action"] for s in data["steps"]] == ["apply", "finish"]
        # Grounding: only the visible id + its real src reached the engine.
        _, payload = stub_node["post"]
        assert payload["allowedCatalogIds"] == [str(ok)]
        assert payload["imageSrcById"] == {str(ok): "assets/ok.png"}


def test_plan_endpoint_returns_a_scene_plan(app):
    # No key in tests → the deterministic stub plan (markdown, scene sections), hermetic.
    url = "/ai-agent/studio/plan"
    body = {"prompt": "a vibrant Galway day trip", "item_ids": []}
    with TestClient(app) as c:
        assert c.post(url, json=body).status_code == 401
        provider = auth_header(c, Role.content_provider)
        assert c.post(url, json=body, headers=provider).status_code == 403
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(url, json=body, headers=agent)
        assert r.status_code == 200
        data = r.json()
        assert data["provider"] == "stub"
        assert "## Scene 1" in data["plan"]
        assert "vibrant Galway day trip" in data["plan"]


def test_agent_stream_emits_sse_steps_then_done(app, stub_node):
    body = {"design": _DESIGN, "prompt": "Promote the west of Ireland", "item_ids": []}
    with TestClient(app) as c:
        assert c.post("/ai-agent/studio/agent/stream", json=body).status_code == 401
        agent = auth_header(c, Role.tourism_agent)
        r = c.post("/ai-agent/studio/agent/stream", headers=agent, json=body)
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]
        events = [
            json.loads(frame[5:].strip())
            for frame in r.text.split("\n\n")
            if frame.startswith("data:")
        ]
        kinds = [e.get("t") for e in events]
        assert "step" in kinds and kinds[-1] == "done"  # streamed steps, then a final result
        done = events[-1]
        assert done["finished"] is True and done["provider"] == "stub" and "design" in done
