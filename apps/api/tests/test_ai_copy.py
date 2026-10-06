"""AI copy routes — Generate caption + Generate keywords (agent-only, deterministic under stub).

Hermetic: the conftest settings carry no provider key, so ``get_provider`` returns the
deterministic ``StubProvider`` (Contract 4). Synthetic catalog content only.
"""

from __future__ import annotations

from sqlalchemy import select

from app.models.catalog import CatalogEntry, CatalogType, EntryStatus
from app.models.composition import Composition
from app.models.user import Role, User


def _visible_entry(db, provider_id: int) -> CatalogEntry:
    # Catalog-less, approved, brand-safe, unexpired, no access scope -> visible to every agent via
    # the legacy Contract-1 gate (see app.services.visibility).
    entry = CatalogEntry(
        type=CatalogType.place,
        title="Cliffs of Moher",
        destination="County Clare",
        description="Dramatic Atlantic sea cliffs on the Wild Atlantic Way.",
        status=EntryStatus.approved,
        brand_safe=True,
        provider_id=provider_id,
    )
    db.add(entry)
    db.flush()
    return entry


def _make_composition(client, *, agent_email: str = "agent@test.local") -> int:
    SessionLocal = client.app.state.sessionmaker
    with SessionLocal() as db:
        agent = db.scalars(select(User).where(User.email == agent_email)).one()
        provider = db.scalars(select(User).where(User.role == Role.content_provider)).one()
        entry = _visible_entry(db, provider.id)
        comp = Composition(agent_id=agent.id, format="social", item_ids=[entry.id])
        db.add(comp)
        db.commit()
        return comp.id


def test_caption_requires_agent_role(client, provider_headers):
    comp_id = _make_composition(client)
    body = {"composition_id": comp_id}
    # Unauthenticated -> 401; a non-agent (content provider) -> 403.
    assert client.post("/ai/caption", json=body).status_code == 401
    assert client.post("/ai/caption", headers=provider_headers, json=body).status_code == 403
    assert client.post("/ai/keywords", headers=provider_headers, json=body).status_code == 403


def test_caption_composition_not_owned_returns_404(client, agent_headers, second_agent_headers):
    comp_id = _make_composition(client)  # owned by agent@test.local
    # A different agent cannot reach it, and an unknown id is equally a 404.
    assert client.post(
        "/ai/caption", headers=second_agent_headers, json={"composition_id": comp_id}
    ).status_code == 404
    assert client.post(
        "/ai/caption", headers=agent_headers, json={"composition_id": 9999}
    ).status_code == 404
    assert client.post(
        "/ai/keywords", headers=second_agent_headers, json={"composition_id": comp_id}
    ).status_code == 404


def test_caption_non_empty_and_deterministic_under_stub(client, agent_headers):
    comp_id = _make_composition(client)
    body = {"composition_id": comp_id}
    first = client.post("/ai/caption", headers=agent_headers, json=body)
    second = client.post("/ai/caption", headers=agent_headers, json=body)
    assert first.status_code == 200 and second.status_code == 200
    caption = first.json()["caption"]
    assert isinstance(caption, str) and caption.strip()
    assert len(caption) <= 2200
    # Contract 4: same inputs + stub -> identical output.
    assert first.json() == second.json()


def test_keywords_returns_nonempty_hashtags(client, agent_headers):
    comp_id = _make_composition(client)
    resp = client.post("/ai/keywords", headers=agent_headers, json={"composition_id": comp_id})
    assert resp.status_code == 200
    hashtags = resp.json()["hashtags"]
    assert isinstance(hashtags, list) and hashtags
    assert all(isinstance(t, str) and t.startswith("#") and len(t) > 1 for t in hashtags)
    # Deterministic under the stub.
    again = client.post("/ai/keywords", headers=agent_headers, json={"composition_id": comp_id})
    assert again.json() == resp.json()
