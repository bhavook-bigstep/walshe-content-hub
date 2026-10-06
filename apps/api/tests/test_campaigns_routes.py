"""Campaign CRUD routes — agent-scoped (Inc 1 Task 4)."""

from app.models.user import Role
from tests.conftest import auth_header


def _create(client, headers, **over):
    body = {"name": "Australia Aug", "destination": "Australia",
            "starts_on": "2026-08-01", "ends_on": "2026-08-31"}
    body.update(over)
    return client.post("/campaigns", json=body, headers=headers)


def test_create_and_list_scoped_to_agent(client):
    a = auth_header(client, Role.tourism_agent)
    r = _create(client, a)
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "active" and r.json()["post_count"] == 0
    lst = client.get("/campaigns", headers=a).json()
    assert len(lst) == 1 and lst[0]["name"] == "Australia Aug"


def test_second_agent_cannot_see_or_read_first_agents_campaigns(client, second_agent_headers):
    a = auth_header(client, Role.tourism_agent)
    cid = _create(client, a).json()["id"]
    # a genuinely different agent (seeded by the `second_agent_headers` fixture):
    assert client.get("/campaigns", headers=second_agent_headers).json() == []  # Review Focus #4
    assert client.get(f"/campaigns/{cid}",
                      headers=second_agent_headers).status_code == 404           # Review Focus #2


def test_detail_includes_posts_empty_and_non_owner_404(client):
    a = auth_header(client, Role.tourism_agent)
    cid = _create(client, a).json()["id"]
    detail = client.get(f"/campaigns/{cid}", headers=a)
    assert detail.status_code == 200 and detail.json()["posts"] == []
    assert client.get("/campaigns/99999", headers=a).status_code == 404
    assert client.get(f"/campaigns/{cid}",
                      headers=auth_header(client, Role.content_provider)).status_code == 403


def test_ends_before_start_is_422(client):
    a = auth_header(client, Role.tourism_agent)
    assert _create(client, a, ends_on="2026-07-01").status_code == 422
