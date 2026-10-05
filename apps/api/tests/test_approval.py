"""AC35 — send-back-with-reason approval step (FR-14). Synthetic fixtures; hermetic."""

from __future__ import annotations


def _login(client, email: str, password: str) -> dict[str, str]:
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _entry_in_review(client, provider_headers) -> int:
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": "County Fair", "destination": "Cork"},
    )
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    r = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={"status": "in_review"})
    assert r.status_code == 200, r.text
    return entry_id


def test_send_back_sets_draft_with_reason(client, provider_headers):
    entry_id = _entry_in_review(client, provider_headers)
    reason = "Add captions to the hero image before this can be approved."

    r = client.post(
        f"/catalog/{entry_id}/send-back", headers=provider_headers, json={"reason": reason}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "draft"
    assert body["review_reason"] == reason

    # The reason persists (a no-op PATCH is used here purely to re-read the entry).
    again = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={})
    assert again.json()["status"] == "draft"
    assert again.json()["review_reason"] == reason


def test_send_back_audited_and_resubmit_returns_to_review(
    client, provider_headers, admin_headers, agent_headers
):
    entry_id = _entry_in_review(client, provider_headers)
    r = client.post(
        f"/catalog/{entry_id}/send-back",
        headers=provider_headers,
        json={"reason": "Needs a current offer attached."},
    )
    assert r.status_code == 200, r.text

    # The send-back is traceable (Contract 3 / AC37).
    rows = client.get("/audit", headers=admin_headers).json()
    assert any(a["action"] == "send_back" and a["target_id"] == entry_id for a in rows)

    # Resubmitting returns it to review and clears the reason (AC35: "returns to the same point").
    r = client.patch(f"/catalog/{entry_id}", headers=provider_headers, json={"status": "in_review"})
    assert r.json()["status"] == "in_review"
    assert r.json()["review_reason"] == ""

    # A super admin may send back any provider's entry; an agent may not.
    assert (
        client.post(
            f"/catalog/{entry_id}/send-back", headers=admin_headers, json={"reason": "hold"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/catalog/{entry_id}/send-back", headers=agent_headers, json={"reason": "no"}
        ).status_code
        == 403
    )


def test_send_back_validation_and_cross_provider_authz(client, provider_headers, admin_headers):
    """Blank reason -> 422, missing entry -> 404, and another provider cannot send back (404)."""
    entry_id = _entry_in_review(client, provider_headers)

    # A reason is required (empty and whitespace-only are both rejected).
    assert (
        client.post(
            f"/catalog/{entry_id}/send-back", headers=provider_headers, json={"reason": ""}
        ).status_code
        == 422
    )
    assert (
        client.post(
            f"/catalog/{entry_id}/send-back", headers=provider_headers, json={"reason": "   "}
        ).status_code
        == 422
    )

    # Missing entry is indistinguishable from forbidden (404).
    assert (
        client.post(
            "/catalog/999999/send-back", headers=provider_headers, json={"reason": "x"}
        ).status_code
        == 404
    )

    # A different provider cannot send back someone else's entry — 404, existence not leaked.
    created = client.post(
        "/admin/users",
        headers=admin_headers,
        json={
            "email": "board2@test.local",
            "password": "test-pass-222",
            "role": "content_provider",
            "organization": "Other Board",
        },
    )
    assert created.status_code == 201, created.text
    other = _login(client, "board2@test.local", "test-pass-222")
    assert (
        client.post(
            f"/catalog/{entry_id}/send-back", headers=other, json={"reason": "nope"}
        ).status_code
        == 404
    )
