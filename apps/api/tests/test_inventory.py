"""Provider structured inventory (AC29): typed attributes + custom sections, the self-describing
template schema, media library, team, and content performance. Hermetic synthetic data."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_create_structured_entry_with_custom_sections(
    client: TestClient, provider_headers: dict[str, str]
) -> None:
    body = {
        "type": "event",
        "title": "Trade Expo",
        "description": "d",
        "destination": "Cork",
        "market_tags": ["trade"],
        "attributes": {"venue": "Cork Hall", "expected_attendance": 500},
        "highlights": ["Great venue", "Free entry"],
        "custom_sections": [{"title": "Parking", "body": "Free on-site"}],
    }
    resp = client.post("/catalog", headers=provider_headers, json=body)
    assert resp.status_code == 201, resp.text
    entry = resp.json()
    assert entry["attributes"]["venue"] == "Cork Hall"
    assert entry["highlights"] == ["Great venue", "Free entry"]
    assert entry["custom_sections"][0]["title"] == "Parking"

    # Edit the structured content via PUT.
    upd = client.put(
        f"/catalog/{entry['id']}",
        headers=provider_headers,
        json={"highlights": ["Only one"], "custom_sections": [{"title": "New", "body": "x"}]},
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["highlights"] == ["Only one"]
    assert upd.json()["custom_sections"][0]["title"] == "New"


def test_content_templates_schema(client: TestClient) -> None:
    resp = client.get("/catalog/templates")  # public, self-describing
    assert resp.status_code == 200, resp.text
    templates = resp.json()["templates"]
    assert "event" in templates and "place" in templates
    field = templates["event"][0]
    assert {"key", "label", "type"} <= set(field.keys())


def test_media_team_and_performance(
    client: TestClient, provider_headers: dict[str, str], agent_headers: dict[str, str]
) -> None:
    media = client.get("/me/media", headers=provider_headers)
    assert media.status_code == 200
    assert isinstance(media.json(), list)

    before = client.get("/me/team", headers=provider_headers).json()
    invite = client.post(
        "/me/team",
        headers=provider_headers,
        json={"email": "colleague@test.local", "password": "test-pass-123", "display_name": "Sam"},
    )
    assert invite.status_code == 201, invite.text
    after = client.get("/me/team", headers=provider_headers).json()
    assert len(after) == len(before) + 1

    perf = client.get("/me/performance", headers=provider_headers)
    assert perf.status_code == 200
    assert "rows" in perf.json() and "total_reach" in perf.json()

    # Provider workspace endpoints are provider-only.
    assert client.get("/me/media", headers=agent_headers).status_code == 403
    assert client.get("/me/performance", headers=agent_headers).status_code == 403
