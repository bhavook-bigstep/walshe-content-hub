"""Contract 1 prerequisite — agent_visible_entries_by_ids + EntryOut.asset_keys."""

from __future__ import annotations

from datetime import datetime, timezone

from app.models.catalog import Asset, CatalogEntry, CatalogType, EntryStatus
from app.models.user import Role, User
from app.schemas.catalog import EntryOut
from app.services.visibility import agent_visible_entries_by_ids

_NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _entry(db, title, *, approved=True, safe=True, tenants=None, agents=None) -> CatalogEntry:
    e = CatalogEntry(
        type=CatalogType.event,
        title=title,
        description="",
        destination="Galway",
        status=EntryStatus.approved if approved else EntryStatus.draft,
        brand_safe=safe,
        allowed_tenant_ids=tenants or [],
        allowed_agent_ids=agents or [],
        provider_id=1,
    )
    db.add(e)
    db.commit()
    return e


def test_by_ids_order_dedupe_and_hidden_dropped(app):
    with app.state.sessionmaker() as db:
        agent = db.query(User).filter(User.role == Role.tourism_agent).one()
        a = _entry(db, "A")
        b = _entry(db, "B")
        draft = _entry(db, "Draft", approved=False)
        unsafe = _entry(db, "Unsafe", safe=False)
        scoped = _entry(db, "Scoped", tenants=[999], agents=[999])

        ids = [b.id, a.id, b.id, draft.id, unsafe.id, scoped.id, 987654]
        got = agent_visible_entries_by_ids(db, agent, ids, now=_NOW)
        assert [e.id for e in got] == [b.id, a.id]
        assert agent_visible_entries_by_ids(db, agent, [], now=_NOW) == []


def test_asset_keys_property_and_schema(app):
    with app.state.sessionmaker() as db:
        e = _entry(db, "WithAssets")
        assert e.asset_keys == []
        db.add(Asset(entry_id=e.id, object_key="k/1.png", content_type="image/png"))
        db.add(Asset(entry_id=e.id, object_key="k/2.png", content_type="image/png"))
        db.commit()
        db.refresh(e)
        assert sorted(e.asset_keys) == ["k/1.png", "k/2.png"]
        assert sorted(EntryOut.from_entry(e, now=_NOW).asset_keys) == ["k/1.png", "k/2.png"]
