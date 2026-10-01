"""AC6 — CONTRACT 1: agents only ever see approved, brand-safe, in-scope entries."""
from __future__ import annotations


def _create(client, provider_headers, title: str) -> int:
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": title, "destination": "Galway"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _patch(client, provider_headers, entry_id: int, **fields) -> None:
    resp = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json=fields)
    assert resp.status_code == 200, resp.text


def test_agent_never_sees_unapproved(client, provider_headers, agent_headers):
    valid = _create(client, provider_headers, "Valid")
    _patch(client, provider_headers, valid, status="approved", brand_safe=True)

    draft = _create(client, provider_headers, "Draft")  # stays draft + not brand-safe

    unsafe = _create(client, provider_headers, "Unsafe")
    _patch(client, provider_headers, unsafe, status="approved", brand_safe=False)

    out_of_scope = _create(client, provider_headers, "OutOfScope")
    _patch(
        client,
        provider_headers,
        out_of_scope,
        status="approved",
        brand_safe=True,
        allowed_tenant_ids=[999],
        allowed_agent_ids=[999],
    )

    visible_ids = [e["id"] for e in client.get("/catalog", headers=agent_headers).json()]
    assert visible_ids == [valid]  # ONLY the valid one

    # A direct read of a hidden entry is indistinguishable from missing (no information leak).
    assert client.get(f"/catalog/{draft}", headers=agent_headers).status_code == 404
    assert client.get(f"/catalog/{unsafe}", headers=agent_headers).status_code == 404
    assert client.get(f"/catalog/{out_of_scope}", headers=agent_headers).status_code == 404
    assert client.get(f"/catalog/{valid}", headers=agent_headers).status_code == 200
