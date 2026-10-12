"""Studio Builder agent — the inbuilt tool loop with progressive op disclosure.

Unit tests drive the pure core (``run_studio_agent``) with a scripted fake provider + a fake
apply_fn (no Node, no network); the endpoint tests exercise the deterministic stub path + grounding
through the facade (Node stubbed). Together they assert: the system prompt carries only the op INDEX
(no schemas), params are disclosed only via ``describe_ops``, the loop applies + finishes, budgets
hold, bad replies don't abort, and the stub path is deterministic + grounded (Contract 4).
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.ai.base import AIProvider, AIResponse, ChatMessage
from app.ai.studio_agent import AgentItem, build_system_prompt, run_studio_agent
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


class _FakeProvider(AIProvider):
    """Replays a script of replies and records the (system, messages) it was handed each call."""

    name = "fake"

    def __init__(self, replies: list[str]) -> None:
        super().__init__("fake-1")
        self._replies = list(replies)
        self.calls: list[tuple[str, list[ChatMessage]]] = []

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:  # pragma: no cover
        return AIResponse(text="", provider=self.name, model=self.model)

    def stream_chat(
        self, system: str, messages: list[ChatMessage], *, max_tokens: int = 512
    ) -> Iterator[str]:
        self.calls.append((system, list(messages)))
        yield self._replies.pop(0) if self._replies else '{"action":"finish","note":"done"}'


def _apply_fn_factory() -> tuple[list, object]:
    """A fake apply_fn that records calls and returns the design with an applied-count marker."""
    seen: list = []

    def apply_fn(design, calls, scene_index):
        seen.append((calls, scene_index))
        new = dict(design)
        new["_applied"] = new.get("_applied", 0) + len(calls)
        return {
            "design": new,
            "results": [{"op": c.get("op", "?"), "status": "applied"} for c in calls],
            "valid": True,
        }

    return seen, apply_fn


def _noop_observe(design, scene_index):
    """A fake observe_fn: returns a canned word-observation without a Node round-trip."""
    return {"scenes": [{"index": scene_index or 0, "description": "stub observation"}]}


def _noop_generate(concept, opts):
    """A fake generate_sprite_fn: returns a sprite handle without calling the image API."""
    return {"ref": "user:1", "frame_count": 4, "fps": 10, "width": 32, "height": 32}


# ── Progressive disclosure ────────────────────────────────────────────────────────────────────────
def test_system_prompt_carries_index_only_not_schemas():
    items = [AgentItem(id=7, title="Cliffs of Moher", destination="Galway")]
    system = build_system_prompt("Promote the cliffs", _SPEC, items)
    # The op INDEX (names + one-liners) is present...
    assert "place: place an approved catalog image" in system
    assert "write-copy: add a text caption" in system
    # ...the approved id is present...
    assert "7 — Cliffs of Moher (Galway)" in system
    # ...but the param SCHEMAS are NOT dumped up front (they arrive via describe_ops).
    assert '"item_id"' not in system
    assert "params" not in system


def test_describe_ops_discloses_params_on_demand_only():
    _, apply_fn = _apply_fn_factory()
    provider = _FakeProvider(
        [
            '{"action":"describe_ops","ops":["place"]}',
            '{"action":"finish","note":"ok"}',
        ]
    )
    result = run_studio_agent(
        design=_DESIGN, prompt="brief", items=[AgentItem(7, "Cliffs")], spec=_SPEC,
        provider=provider, apply_fn=apply_fn, observe_fn=_noop_observe,
        generate_sprite_fn=_noop_generate,
    )
    assert [s["action"] for s in result.steps] == ["describe_ops", "finish"]
    # The SECOND provider call must have been fed the params for `place` only — not for other ops.
    _, second_messages = provider.calls[1]
    disclosed = second_messages[-1].text
    assert '"place"' in disclosed and '"item_id"' in disclosed
    assert '"write-copy"' not in disclosed  # only the requested op's schema was disclosed


# ── The loop ──────────────────────────────────────────────────────────────────────────────────────
def test_loop_describe_apply_finish():
    seen, apply_fn = _apply_fn_factory()
    provider = _FakeProvider(
        [
            '{"action":"describe_ops","ops":["place","write-copy"]}',
            '{"action":"apply","calls":[{"op":"place","item_id":7},{"op":"write-copy","text":"Hi"}]}',
            '{"action":"finish","note":"done"}',
        ]
    )
    result = run_studio_agent(
        design=_DESIGN, prompt="brief", items=[AgentItem(7, "Cliffs")], spec=_SPEC,
        provider=provider, apply_fn=apply_fn, observe_fn=_noop_observe,
        generate_sprite_fn=_noop_generate,
    )
    assert [s["action"] for s in result.steps] == ["describe_ops", "apply", "finish"]
    assert result.applied == 1 and result.finished is True and result.provider == "fake"
    assert result.design["_applied"] == 2  # both calls flowed through apply_fn
    assert seen[0][0] == [{"op": "place", "item_id": 7}, {"op": "write-copy", "text": "Hi"}]


def test_observe_action_feeds_scene_description_back():
    seen_obs: list = []

    def observe_fn(design, scene_index):
        seen_obs.append(scene_index)
        return {"scenes": [{"index": 0, "description": 'Scene "Intro" — 4.0s. Empty canvas.'}]}

    _, apply_fn = _apply_fn_factory()
    provider = _FakeProvider(
        ['{"action":"observe","scene":0}', '{"action":"finish","note":"seen"}']
    )
    result = run_studio_agent(
        design=_DESIGN, prompt="b", items=[], spec=_SPEC, provider=provider,
        apply_fn=apply_fn, observe_fn=observe_fn, generate_sprite_fn=_noop_generate,
    )
    assert [s["action"] for s in result.steps] == ["observe", "finish"]
    assert seen_obs == [0]  # observe_fn was called for scene 0
    # The description was fed back to the model as the next turn.
    _, second_messages = provider.calls[1]
    assert "Empty canvas" in second_messages[-1].text


def test_generate_sprite_action_returns_a_ref_the_model_can_place():
    seen: list = []

    def generate_sprite_fn(concept, opts):
        seen.append((concept, opts))
        return {"ref": "user:7", "frame_count": 6, "fps": 10, "width": 48, "height": 48}

    _, apply_fn = _apply_fn_factory()
    provider = _FakeProvider(
        [
            '{"action":"generate-sprite","concept":"a walking fox","cols":6}',
            '{"action":"finish","note":"made a sprite"}',
        ]
    )
    result = run_studio_agent(
        design=_DESIGN, prompt="b", items=[], spec=_SPEC, provider=provider,
        apply_fn=apply_fn, observe_fn=_noop_observe, generate_sprite_fn=generate_sprite_fn,
    )
    assert [s["action"] for s in result.steps] == ["generate-sprite", "finish"]
    assert seen == [("a walking fox", {"cols": 6})]
    # The ref was fed back so the model can add-sprite with it.
    _, second_messages = provider.calls[1]
    assert "user:7" in second_messages[-1].text


def test_apply_budget_caps_applies():
    _, apply_fn = _apply_fn_factory()
    apply_reply = '{"action":"apply","calls":[{"op":"write-copy","text":"x"}]}'
    provider = _FakeProvider([apply_reply, apply_reply, apply_reply])  # 3 applies, budget = 2
    result = run_studio_agent(
        design=_DESIGN, prompt="b", items=[], spec=_SPEC, provider=provider,
        apply_fn=apply_fn, observe_fn=_noop_observe,
        generate_sprite_fn=_noop_generate, max_rounds=5, max_applies=2,
    )
    assert result.applied == 2
    assert any(s.get("skipped") == "budget" for s in result.steps)


def test_unparseable_reply_does_not_abort_loop():
    _, apply_fn = _apply_fn_factory()
    provider = _FakeProvider(["sorry, I can't do that", '{"action":"finish","note":"ok"}'])
    result = run_studio_agent(
        design=_DESIGN, prompt="b", items=[], spec=_SPEC, provider=provider,
        apply_fn=apply_fn, observe_fn=_noop_observe,
        generate_sprite_fn=_noop_generate,
    )
    assert result.steps[0]["action"] == "invalid"
    assert result.finished is True


def test_provider_failure_falls_back_to_deterministic_compose():
    _, apply_fn = _apply_fn_factory()

    class _Boom(AIProvider):
        name = "boom"

        def complete(self, prompt, *, max_tokens=512):  # pragma: no cover
            return AIResponse(text="", provider=self.name, model=self.model)

        def stream_chat(self, system, messages, *, max_tokens=512):
            raise RuntimeError("provider down")

    result = run_studio_agent(
        design=_DESIGN, prompt="brief", items=[AgentItem(7, "Cliffs")], spec=_SPEC,
        provider=_Boom("boom-1"), apply_fn=apply_fn, observe_fn=_noop_observe,
        generate_sprite_fn=_noop_generate,
    )
    assert result.finished is True and result.applied == 1
    assert result.steps[-1]["action"] == "finish"


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
        assert len(data["sprite"]["frame_keys"]) >= 1  # at least one sliced frame, stored
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
