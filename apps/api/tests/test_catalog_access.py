"""AC5 — Mark brand-safe + set access scope; visibility reflects the scope."""

from __future__ import annotations


def _create(client, provider_headers) -> int:
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "offer", "title": "Scoped Offer", "destination": "Kerry"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_set_brand_safe_and_access_scope(client, provider_headers, agent_headers):
    entry_id = _create(client, provider_headers)

    # Approve + mark brand-safe, scoped to tenant 1 (the agent's tenant).
    patched = client.patch(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"brand_safe": True, "status": "approved", "allowed_tenant_ids": [1]},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["brand_safe"] is True
    assert patched.json()["status"] == "approved"

    # In-scope agent (tenant 1) can see it.
    ids = [e["id"] for e in client.get("/catalog", headers=agent_headers).json()]
    assert entry_id in ids

    # Re-scope away from the agent's tenant → no longer visible.
    client.patch(
        f"/catalog/{entry_id}", headers=provider_headers, json={"allowed_tenant_ids": [999]}
    )
    ids = [e["id"] for e in client.get("/catalog", headers=agent_headers).json()]
    assert entry_id not in ids
