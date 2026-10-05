"""AC51 — per-user media storage: Local (uploaded) + Agent (generated), owner-scoped."""

from __future__ import annotations

PNG = b"\x89PNG\r\n\x1a\nsynthetic"


def test_upload_text_generate_list_and_owner_scope(client, agent_headers, provider_headers):
    # Local: upload an image + a video + a text snippet.
    up = client.post(
        "/me/library/upload", headers=agent_headers,
        files={"file": ("a.png", PNG, "image/png")}, data={"title": "mine"},
    )
    assert up.status_code == 201 and up.json()["source"] == "local" and up.json()["kind"] == "image"
    key = up.json()["object_key"]
    assert client.post(
        "/me/library/upload", headers=agent_headers,
        files={"file": ("a.mp4", b"\x00\x00", "video/mp4")},
    ).status_code == 201
    txt = client.post("/me/library/text", headers=agent_headers, json={"text": "hi", "title": "t"})
    assert txt.status_code == 201

    # An unsupported upload type is refused.
    assert client.post(
        "/me/library/upload", headers=agent_headers,
        files={"file": ("x.svg", b"<svg/>", "image/svg+xml")},
    ).status_code == 415

    # Agent: generate produces an image + text (deterministic, same prompt → same bytes).
    gen = client.post("/me/library/generate", headers=agent_headers, json={"prompt": "a sunset"})
    assert gen.status_code == 201
    assert {a["source"] for a in gen.json()} == {"agent"}
    assert {a["kind"] for a in gen.json()} == {"image", "text"}

    # List filtered by source feeds the studio's Local / Agent sections.
    local = client.get("/me/library?source=local", headers=agent_headers).json()
    agent_gen = client.get("/me/library?source=agent", headers=agent_headers).json()
    assert len(local) == 3 and all(a["source"] == "local" for a in local)
    assert len(agent_gen) == 2 and all(a["source"] == "agent" for a in agent_gen)

    # Owner-scoped: the owner can fetch their upload; another user gets 404 (indistinguishable).
    assert client.get(f"/assets/{key}", headers=agent_headers).status_code == 200
    assert client.get(f"/assets/{key}", headers=provider_headers).status_code == 404


def test_library_is_owner_scoped_and_validates_source(client, agent_headers, provider_headers):
    client.post("/me/library/text", headers=agent_headers, json={"text": "a", "title": "t"})
    # The list is owner-scoped: a different user sees none of the agent's assets.
    assert client.get("/me/library", headers=provider_headers).json() == []
    assert len(client.get("/me/library", headers=agent_headers).json()) == 1
    # An unknown source is rejected at the boundary.
    assert client.get("/me/library?source=bogus", headers=agent_headers).status_code == 422


def test_generated_image_is_deterministic(client, agent_headers):
    gen = {"prompt": "same prompt"}
    a = client.post("/me/library/generate", headers=agent_headers, json=gen).json()
    b = client.post("/me/library/generate", headers=agent_headers, json=gen).json()
    key_a = next(x["object_key"] for x in a if x["kind"] == "image")
    key_b = next(x["object_key"] for x in b if x["kind"] == "image")
    bytes_a = client.get(f"/assets/{key_a}", headers=agent_headers).content
    bytes_b = client.get(f"/assets/{key_b}", headers=agent_headers).content
    assert bytes_a == bytes_b and bytes_a[:8] == b"\x89PNG\r\n\x1a\n"
