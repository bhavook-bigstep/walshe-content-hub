"""AC7 — Agent browse/search/filter by destination and type."""

from __future__ import annotations


def _approved(client, provider_headers, *, type_: str, title: str, destination: str) -> int:
    created = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": type_, "title": title, "destination": destination},
    )
    assert created.status_code == 201, created.text
    entry_id = created.json()["id"]
    client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    return entry_id


def test_filter_by_destination_and_type(client, provider_headers, agent_headers):
    galway_event = _approved(
        client, provider_headers, type_="event", title="Galway Event", destination="Galway"
    )
    galway_place = _approved(
        client, provider_headers, type_="place", title="Galway Place", destination="Galway"
    )
    clare_event = _approved(
        client, provider_headers, type_="event", title="Clare Event", destination="Clare"
    )

    by_dest = client.get("/catalog?destination=Galway", headers=agent_headers).json()
    assert {e["id"] for e in by_dest} == {galway_event, galway_place}

    by_type = client.get("/catalog?type=event", headers=agent_headers).json()
    assert {e["id"] for e in by_type} == {galway_event, clare_event}

    both = client.get("/catalog?destination=Galway&type=event", headers=agent_headers).json()
    assert {e["id"] for e in both} == {galway_event}

    by_text = client.get("/catalog?q=place", headers=agent_headers).json()
    assert {e["id"] for e in by_text} == {galway_place}
