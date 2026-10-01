"""AC10 — Builder: deterministic stub, grounded in selected items, agent-only, no network."""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.ai.base import AIProvider, AIResponse
from app.ai.builder import BuilderItem, build_design
from app.ai.stub import StubProvider
from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role
from app.routers import builder as builder_router
from tests.conftest import auth_header

ITEMS = [
    BuilderItem(id=1, title="Test Cliffs Tour", destination="Testshire"),
    BuilderItem(id=2, title="Sample Harbour Stay", destination="Exampleport"),
]
PROMPT = "A summer poster"


@pytest.fixture(autouse=True)
def _no_network(monkeypatch):
    def _boom(*a, **k):  # pragma: no cover - only on regression
        raise AssertionError("no network allowed")

    monkeypatch.setattr(httpx, "post", _boom)


class _FakeLLM(AIProvider):
    name = "fake"

    def __init__(self, text: str) -> None:
        super().__init__("fake-1")
        self._text = text

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        return AIResponse(text=self._text, provider=self.name, model=self.model)


def test_builder_stub_is_deterministic():
    a = build_design(PROMPT, ITEMS, StubProvider())
    b = build_design(PROMPT, ITEMS, StubProvider())
    assert a == b
    assert a.provider == "stub"
    selected_titles = {i.title for i in ITEMS}
    copy_ops = [o for o in a.ops if o["op"] == "write-copy" and o["item_id"] is not None]
    assert {o["item_id"] for o in a.ops if o["item_id"] is not None} == {1, 2}
    for op in copy_ops:
        assert any(op["text"].startswith(t) for t in selected_titles)
    assert len(a.pages[0]["nodes"]) == 3  # headline + one per item


def test_llm_ops_are_validated_against_selected_items():
    text = json.dumps(
        [
            {"op": "place", "item_id": 1},
            {"op": "place", "item_id": 99},  # not selected -> dropped
            {"op": "write-copy", "item_id": 99, "text": "ungrounded"},
            {"op": "write-copy", "item_id": 2, "text": "  Harbour views  "},
            "junk",
        ]
    )
    doc = build_design(PROMPT, ITEMS, _FakeLLM(text))
    assert doc.provider == "fake"
    assert {o["item_id"] for o in doc.ops} == {1, 2}
    assert [n["text"] for n in doc.pages[0]["nodes"]] == ["Harbour views"]


@pytest.mark.parametrize(
    "bad",
    ["not json", "42", json.dumps({"ops": []}), json.dumps([{"op": "x"}])],
)
def test_unusable_llm_output_falls_back_to_fixed_layout(bad):
    fallback = build_design(PROMPT, ITEMS, StubProvider()).ops
    assert build_design(PROMPT, ITEMS, _FakeLLM(bad)).ops == fallback


def _seed(app, title, *, approved=True, safe=True, tenants=None, agents=None) -> int:
    with app.state.sessionmaker() as db:
        e = CatalogEntry(
            type=CatalogType.event,
            title=title,
            description="",
            destination="Testshire",
            status=EntryStatus.approved if approved else EntryStatus.draft,
            brand_safe=safe,
            allowed_tenant_ids=tenants or [],
            allowed_agent_ids=agents or [],
            provider_id=1,
        )
        db.add(e)
        db.commit()
        return e.id


def test_builder_route_agent_only_and_stub(app):
    app.include_router(builder_router.router)
    eid = _seed(app, "Test Cliffs Tour")
    payload = {"prompt": PROMPT, "item_ids": [eid]}
    with TestClient(app) as c:
        assert c.post("/builder/design", json=payload).status_code == 401
        provider = auth_header(c, Role.content_provider)
        assert c.post("/builder/design", json=payload, headers=provider).status_code == 403
        agent = auth_header(c, Role.tourism_agent)
        r1 = c.post("/builder/design", json=payload, headers=agent)
        r2 = c.post("/builder/design", json=payload, headers=agent)
        assert r1.status_code == 200 and r1.json() == r2.json()
        assert r1.json()["provider"] == "stub"
        empty = c.post("/builder/design", json={"prompt": PROMPT, "item_ids": []}, headers=agent)
        assert empty.status_code == 422


def test_builder_route_resolves_ids_through_visibility(app):
    app.include_router(builder_router.router)
    ok = _seed(app, "Visible Cliffs Tour")
    draft = _seed(app, "Draft Secret", approved=False)
    unsafe = _seed(app, "Unsafe Secret", safe=False)
    scoped = _seed(app, "Scoped Secret", tenants=[999], agents=[999])
    bogus = 987654
    with TestClient(app) as c:
        agent = auth_header(c, Role.tourism_agent)
        r = c.post(
            "/builder/design",
            json={"prompt": PROMPT, "item_ids": [ok, draft, unsafe, scoped, bogus]},
            headers=agent,
        )
        assert r.status_code == 200
        body = r.json()
        assert {o["item_id"] for o in body["ops"] if o["item_id"] is not None} == {ok}
        text = json.dumps(body)
        for hidden in ("Draft Secret", "Unsafe Secret", "Scoped Secret"):
            assert hidden not in text
        hidden_only = c.post(
            "/builder/design",
            json={"prompt": PROMPT, "item_ids": [draft, unsafe, scoped, bogus]},
            headers=agent,
        )
        assert hidden_only.status_code == 404
