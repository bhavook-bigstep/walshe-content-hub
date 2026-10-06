"""AC53 — structured location (country/state/city) + fixed season, used as agent catalog filters."""

from __future__ import annotations


def _public_catalog(client, provider_headers) -> int:
    cid = client.post(
        "/catalogs", headers=provider_headers, json={"name": "Geo", "category": "events"}
    ).json()["id"]
    client.patch(f"/catalogs/{cid}", headers=provider_headers, json={"visibility": "public"})
    return cid


def _entry(client, provider_headers, cid, title, *, country, state, city, season):
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={
            "catalog_id": cid,
            "type": "place",
            "title": title,
            "description": "d",
            "destination": f"{city}, {country}",
            "country": country,
            "state": state,
            "city": city,
            "season": season,
            "visibility": "public",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_geo_reference_endpoint_exposes_hierarchy_and_seasons(client):
    geo = client.get("/catalog/geo").json()
    names = {c["name"] for c in geo["countries"]}
    assert "Ireland" in names
    ireland = next(c for c in geo["countries"] if c["name"] == "Ireland")
    galway = next(s for s in ireland["states"] if s["name"] == "Galway")
    assert "Galway City" in galway["cities"]
    assert {s["value"] for s in geo["seasons"]} >= {"summer", "winter", "year_round"}


def test_entry_stores_structured_location_and_season(client, provider_headers):
    cid = _public_catalog(client, provider_headers)
    out = _entry(
        client, provider_headers, cid, "Cliffs",
        country="Ireland", state="Clare", city="Doolin", season="year_round",
    )
    assert out["country"] == "Ireland" and out["state"] == "Clare"
    assert out["city"] == "Doolin" and out["season"] == "year_round"


def test_agent_filters_by_location_and_season(client, provider_headers, agent_headers):
    cid = _public_catalog(client, provider_headers)
    _entry(client, provider_headers, cid, "Galway Fest",
           country="Ireland", state="Galway", city="Galway City", season="summer")
    _entry(client, provider_headers, cid, "Clare Walk",
           country="Ireland", state="Clare", city="Doolin", season="year_round")
    _entry(client, provider_headers, cid, "Sydney Expo",
           country="Australia", state="New South Wales", city="Sydney", season="summer")

    def titles(qs):
        return {e["title"] for e in client.get(f"/catalog{qs}", headers=agent_headers).json()}

    assert titles("?country=Ireland") == {"Galway Fest", "Clare Walk"}
    assert titles("?country=Ireland&state=Galway") == {"Galway Fest"}
    assert titles("?city=Doolin") == {"Clare Walk"}
    # Season is a closed vocabulary; summer spans two countries here.
    assert titles("?season=summer") == {"Galway Fest", "Sydney Expo"}
    assert titles("?season=summer&country=Australia") == {"Sydney Expo"}
    # An invalid season value is rejected at the boundary.
    assert client.get("/catalog?season=monsoon", headers=agent_headers).status_code == 422
