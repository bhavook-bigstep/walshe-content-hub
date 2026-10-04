"""AC43 — knowledge domains + query classifier, tenant/permission-scoped."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app import clock
from app.agents.knowledge import classify_domain

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _approved(client, provider_headers, *, title, destination, approve=True):
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": title, "destination": destination},
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    if approve:
        client.patch(
            f"/catalog/{eid}",
            headers=provider_headers,
            json={"status": "approved", "brand_safe": True},
        )
    return eid


@pytest.mark.parametrize(
    "query,domain",
    [
        ("sea cliffs in Clare", "product"),
        ("what's our brand colour", "brand"),
        ("show me photos of the coast", "asset"),
        ("how did the campaign performance look", "marketing"),
    ],
)
def test_classify_domain(query, domain):
    assert classify_domain(query) == domain


def test_product_domain_is_scoped_and_ranked(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    visible = _approved(client, provider_headers, title="Cliffs of Moher", destination="Clare")
    _approved(client, provider_headers, title="Draft Cliffs", destination="Clare", approve=False)

    r = client.get("/knowledge?q=sea cliffs in Clare", headers=agent_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["domain"] == "product"
    ids = {i["id"] for i in body["items"]}
    assert visible in ids  # approved item retrieved
    assert all(i["title"] != "Draft Cliffs" for i in body["items"])  # hidden draft never surfaces


def test_brand_domain_returns_scoped_note(client, agent_headers, app):
    _fix_clock(app, T0)
    r = client.get("/knowledge?q=what are our brand colours", headers=agent_headers)
    assert r.status_code == 200, r.text
    assert r.json()["domain"] == "brand"
    assert (
        isinstance(r.json()["note"], str) and r.json()["note"]
    )  # a grounded brand note, no entries
    assert r.json()["items"] == []


def test_knowledge_is_agent_only(client, provider_headers):
    assert client.get("/knowledge?q=anything", headers=provider_headers).status_code == 403


def test_classify_domain_empty_and_mixed():
    assert classify_domain("") == "product"
    assert classify_domain("brand logo image") == "brand"  # explicit brand wins over asset words


def _login(client, email, password):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_agent(client, admin_headers, email):
    r = client.post(
        "/admin/users",
        headers=admin_headers,
        json={"email": email, "password": "test-pass-xyz", "role": "tourism_agent"},
    )
    assert r.status_code == 201, r.text
    return _login(client, email, "test-pass-xyz")


def test_asset_domain_returns_only_items_with_assets(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    with_asset = _approved(client, provider_headers, title="Coast Photo Spot", destination="Clare")
    _approved(client, provider_headers, title="No Media Spot", destination="Clare")
    from app.models.catalog import Asset

    db = app.state.sessionmaker()
    db.add(
        Asset(
            entry_id=with_asset, object_key=f"entries/{with_asset}/p.png", content_type="image/png"
        )
    )
    db.commit()
    db.close()

    r = client.get("/knowledge?q=photos of the coast", headers=agent_headers)
    assert r.status_code == 200, r.text
    assert r.json()["domain"] == "asset"
    ids = {i["id"] for i in r.json()["items"]}
    assert ids == {with_asset}  # only the entry that actually has an asset


def test_marketing_domain_counts_only_the_agents_own_activity(
    client, agent_headers, admin_headers, app
):
    _fix_clock(app, T0)
    # Agent 1 starts with zero compositions.
    r = client.get("/knowledge?q=campaign performance", headers=agent_headers)
    assert r.json()["domain"] == "marketing" and "0 saved" in r.json()["note"]

    client.post("/me/projects", headers=agent_headers, json={"name": "Trip", "item_ids": []})
    assert (
        "1 saved"
        in client.get("/knowledge?q=campaign performance", headers=agent_headers).json()["note"]
    )

    # A second agent's composition does not inflate agent 1's count (tenant/owner isolation).
    other = _make_agent(client, admin_headers, "agent-mkt@test.local")
    client.post("/me/projects", headers=other, json={"name": "Other", "item_ids": []})
    assert (
        "1 saved"
        in client.get("/knowledge?q=campaign performance", headers=agent_headers).json()["note"]
    )


def test_brand_domain_is_scoped_to_the_agents_own_kit(client, agent_headers, admin_headers, app):
    _fix_clock(app, T0)
    # No kit yet → explicit fallback.
    assert (
        "No brand details"
        in client.get("/knowledge?q=brand colours", headers=agent_headers).json()["note"]
    )

    client.put(
        "/me/brand-kit",
        headers=agent_headers,
        json={"primary_color": "#123456", "contact_name": "Agent One"},
    )
    note = client.get("/knowledge?q=brand colours", headers=agent_headers).json()["note"]
    assert "#123456" in note and "Agent One" in note

    # A second agent's kit never leaks into the first agent's brand note.
    other = _make_agent(client, admin_headers, "agent-brand@test.local")
    client.put("/me/brand-kit", headers=other, json={"primary_color": "#ABCDEF"})
    assert (
        "#ABCDEF"
        not in client.get("/knowledge?q=brand colours", headers=agent_headers).json()["note"]
    )
