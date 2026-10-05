"""Cross-provider authorization (security boundary): a provider may only mutate its OWN entries.

``set_access`` (catalog.py), ``delete_entry`` (catalog.py) and ``upload_image`` (assets.py) all
guard ``entry is None or entry.provider_id != provider.id`` -> 404 (never 403: a foreign/unknown
entry is indistinguishable from missing). These tests add a SECOND synthetic provider and assert
it cannot touch the first provider's entry, nor a nonexistent one.
"""

from __future__ import annotations

from app.models.user import Role, User
from app.security import hash_password

# A minimal, valid 1x1 PNG (synthetic bytes, no real asset).
PNG_1X1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082"
)

_BOGUS_ID = 999_999


def _second_provider_headers(client, app) -> dict[str, str]:
    """Create a distinct content_provider (different tenant) and return its auth header."""
    email, password = "provider2@test.local", "test-pass-prov2"
    with app.state.sessionmaker() as db:
        db.add(
            User(
                email=email,
                password_hash=hash_password(password),
                role=Role.content_provider,
                tenant_id=2,
                approved=True,
            )
        )
        db.commit()
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _create_entry(client, provider_headers) -> int:
    resp = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "place", "title": "Owned", "destination": "Clare"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_set_access_on_foreign_or_missing_entry_is_404(client, app, provider_headers):
    entry_id = _create_entry(client, provider_headers)  # owned by provider #1
    other = _second_provider_headers(client, app)

    body = {"brand_safe": True, "status": "approved"}
    assert client.patch(f"/catalog/{entry_id}", headers=other, json=body).status_code == 404
    assert client.patch(f"/catalog/{_BOGUS_ID}", headers=other, json=body).status_code == 404

    # The entry is untouched: its owner can still delete its own entry (so it was never mutated).
    assert client.delete(f"/catalog/{entry_id}", headers=provider_headers).status_code == 204


def test_delete_foreign_or_missing_entry_is_404(client, app, provider_headers):
    entry_id = _create_entry(client, provider_headers)
    other = _second_provider_headers(client, app)

    assert client.delete(f"/catalog/{entry_id}", headers=other).status_code == 404
    assert client.delete(f"/catalog/{_BOGUS_ID}", headers=other).status_code == 404

    # The owner can still delete its own entry -> it really was not removed by the foreign call.
    assert client.delete(f"/catalog/{entry_id}", headers=provider_headers).status_code == 204


def test_upload_image_to_foreign_or_missing_entry_is_404(client, app, provider_headers):
    entry_id = _create_entry(client, provider_headers)
    other = _second_provider_headers(client, app)
    files = {"file": ("pic.png", PNG_1X1, "image/png")}

    assert client.post(f"/catalog/{entry_id}/image", headers=other, files=files).status_code == 404
    assert client.post(f"/catalog/{_BOGUS_ID}/image", headers=other, files=files).status_code == 404
