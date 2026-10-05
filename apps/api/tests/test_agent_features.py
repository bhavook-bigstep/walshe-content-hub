"""Agent workspace features (AC28): saved projects, collections, brand kit, templates."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_projects_crud(
    client: TestClient, agent_headers: dict[str, str], provider_headers: dict[str, str]
) -> None:
    created = client.post(
        "/me/projects",
        headers=agent_headers,
        json={"name": "My post", "format": "social", "item_ids": [1, 2], "design": {"nodes": []}},
    )
    assert created.status_code == 201, created.text
    pid = created.json()["id"]
    assert created.json()["name"] == "My post"

    assert any(p["id"] == pid for p in client.get("/me/projects", headers=agent_headers).json())

    renamed = client.put(f"/me/projects/{pid}", headers=agent_headers, json={"name": "Renamed"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Renamed"

    assert client.delete(f"/me/projects/{pid}", headers=agent_headers).status_code == 204
    # Agent-only.
    assert client.get("/me/projects", headers=provider_headers).status_code == 403


def test_collections_crud(client: TestClient, agent_headers: dict[str, str]) -> None:
    created = client.post(
        "/me/collections", headers=agent_headers, json={"name": "West coast", "item_ids": [1]}
    )
    assert created.status_code == 201, created.text
    cid = created.json()["id"]

    updated = client.put(
        f"/me/collections/{cid}", headers=agent_headers, json={"item_ids": [1, 2, 3]}
    )
    assert updated.status_code == 200 and updated.json()["item_ids"] == [1, 2, 3]

    assert client.delete(f"/me/collections/{cid}", headers=agent_headers).status_code == 204
    assert all(c["id"] != cid for c in client.get("/me/collections", headers=agent_headers).json())


def test_brand_kit_and_templates(client: TestClient, agent_headers: dict[str, str]) -> None:
    kit = client.get("/me/brand-kit", headers=agent_headers)
    assert kit.status_code == 200, kit.text

    updated = client.put(
        "/me/brand-kit",
        headers=agent_headers,
        json={"primary_color": "#123456", "contact_name": "Alex"},
    )
    assert updated.status_code == 200
    assert updated.json()["primary_color"] == "#123456"
    assert updated.json()["contact_name"] == "Alex"

    templates = client.get("/me/design-templates", headers=agent_headers)
    assert templates.status_code == 200
    assert len(templates.json()) >= 1
    assert {"id", "name", "format", "description"} <= set(templates.json()[0].keys())
