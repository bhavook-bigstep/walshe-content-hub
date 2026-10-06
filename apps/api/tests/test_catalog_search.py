"""AC7 — Agent browse/search/filter by destination and type."""

from __future__ import annotations


def _approved(
    client,
    provider_headers,
    *,
    type_: str,
    title: str,
    destination: str,
    description: str = "",
    market_tags: list[str] | None = None,
) -> int:
    body: dict = {"type": type_, "title": title, "destination": destination}
    if description:
        body["description"] = description
    if market_tags:
        body["market_tags"] = market_tags
    created = client.post("/catalog", headers=provider_headers, json=body)
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


def test_free_text_searches_tags_destination_and_description(
    client, provider_headers, agent_headers
):
    """AC83 — free-text `q` matches the full searchable text (tags, destination, description),
    not just the title, so a keyword that lives in a tag or the body still finds the entry."""
    festival = _approved(
        client, provider_headers, type_="event", title="Autumn Gathering",
        destination="Dingle", description="A seaside celebration of trad music.",
        market_tags=["family-friendly", "live-music"],
    )
    gallery = _approved(
        client, provider_headers, type_="place", title="Harbour Gallery",
        destination="Cork", description="Contemporary art by the water.",
    )

    # Title does not contain "music" — it lives in a tag and the description.
    by_tag_word = client.get("/catalog?q=music", headers=agent_headers).json()
    assert {e["id"] for e in by_tag_word} == {festival}

    # Destination is searchable.
    by_destination = client.get("/catalog?q=dingle", headers=agent_headers).json()
    assert {e["id"] for e in by_destination} == {festival}

    # Description word on the other entry.
    by_body = client.get("/catalog?q=contemporary", headers=agent_headers).json()
    assert {e["id"] for e in by_body} == {gallery}


def test_filter_by_tags_and_org(client, provider_headers, agent_headers):
    """AC83 — tag facet keeps entries carrying ANY requested tag (OR); org keeps one provider."""
    music = _approved(
        client, provider_headers, type_="event", title="Jazz Night",
        destination="Sligo", market_tags=["live-music", "nightlife"],
    )
    family = _approved(
        client, provider_headers, type_="place", title="Adventure Park",
        destination="Sligo", market_tags=["family-friendly", "outdoors"],
    )

    by_tag = client.get("/catalog?tags=live-music", headers=agent_headers).json()
    assert {e["id"] for e in by_tag} == {music}

    # Two tags OR-match: adding a tag broadens the result (facet semantics).
    by_two = client.get(
        "/catalog?tags=live-music&tags=outdoors", headers=agent_headers
    ).json()
    assert {e["id"] for e in by_two} == {music, family}

    # Org filter: the seeded test tenant matches; an unknown org matches nothing.
    by_org = client.get("/catalog?org=Test Tourism Board", headers=agent_headers).json()
    assert {music, family} <= {e["id"] for e in by_org}
    assert client.get("/catalog?org=Nowhere Board", headers=agent_headers).json() == []
