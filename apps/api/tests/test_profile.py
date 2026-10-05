"""Profiles & organization (AC27) — self-service profile edit + provider org page.

Hermetic: the conftest seeds one user per role plus tenant id 1. Synthetic data only.
"""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_update_and_read_own_profile(client: TestClient, agent_headers: dict[str, str]) -> None:
    resp = client.patch(
        "/auth/me",
        headers=agent_headers,
        json={
            "display_name": "Alex Rivera",
            "bio": "Loves the coast.",
            "avatar_color": "#C47A2E",
            "preferences": {"reduced_motion": True},
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["display_name"] == "Alex Rivera"
    assert body["avatar_color"] == "#C47A2E"
    assert body["preferences"]["reduced_motion"] is True

    me = client.get("/auth/me", headers=agent_headers).json()
    assert me["display_name"] == "Alex Rivera"
    assert me["bio"] == "Loves the coast."


def test_provider_updates_organization_profile(
    client: TestClient, provider_headers: dict[str, str], agent_headers: dict[str, str]
) -> None:
    assert client.get("/me/organization", headers=provider_headers).status_code == 200

    updated = client.patch(
        "/me/organization",
        headers=provider_headers,
        json={
            "blurb": "Ireland's coast, verified.",
            "markets": ["Ireland", "Australia"],
            "logo_url": "https://example.test/logo.png",
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["blurb"] == "Ireland's coast, verified."
    assert body["markets"] == ["Ireland", "Australia"]
    assert body["logo_url"] == "https://example.test/logo.png"

    # The org endpoint is provider-only.
    assert client.get("/me/organization", headers=agent_headers).status_code == 403


def test_provider_uploads_org_logo_and_it_is_served(client, provider_headers, agent_headers):
    """AC58 — a provider uploads a jpg/png logo; logo_url points at a served asset."""
    png = b"\x89PNG\r\n\x1a\nsynthetic-logo"
    up = client.post(
        "/me/organization/logo", headers=provider_headers,
        files={"file": ("logo.png", png, "image/png")},
    )
    assert up.status_code == 200, up.text
    key_path = up.json()["logo_url"]
    assert key_path.startswith("/assets/tenants/")

    # The logo is served (any authenticated user may fetch an org logo).
    served = client.get(key_path, headers=agent_headers)
    assert served.status_code == 200 and served.content == png

    # SVG (active markup) is refused.
    bad = client.post(
        "/me/organization/logo", headers=provider_headers,
        files={"file": ("x.svg", b"<svg/>", "image/svg+xml")},
    )
    assert bad.status_code == 415

    # Agents can't upload an org logo.
    assert client.post(
        "/me/organization/logo", headers=agent_headers,
        files={"file": ("logo.png", png, "image/png")},
    ).status_code == 403
