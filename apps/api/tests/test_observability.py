"""AC45 — agent-run tracing (in-app) + LangSmith gating. Hermetic: LangSmith is off (no key)."""

from __future__ import annotations

from sqlalchemy import select

from app.config import Settings
from app.models.agent_run import AgentRun
from app.observability import configure_langsmith, record_run, trace_span


def _approved(client, provider_headers, *, title="Harbour Festival", destination="Galway"):
    r = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": title, "destination": destination},
    )
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    client.patch(
        f"/catalog/{eid}",
        headers=provider_headers,
        json={"status": "approved", "brand_safe": True},
    )
    return eid


# --------------------------------------------------------------- LangSmith gating (off by default)


def test_langsmith_is_off_without_a_key():
    s = Settings(jwt_secret="x", langsmith_api_key=None)
    assert s.langsmith_enabled() is False
    assert configure_langsmith(s) is False
    # A disabled span is a transparent no-op that never raises or touches the network.
    with trace_span("x", enabled=False):
        pass


def test_enabled_flag_tracks_the_key():
    assert Settings(jwt_secret="x", langsmith_api_key="ls-fake").langsmith_enabled() is True


# --------------------------------------------------------------- in-app trace


def test_record_run_writes_a_content_free_row(app):
    db = app.state.sessionmaker()
    try:
        record_run(
            db,
            actor_id=3,
            kind="assistant",
            intent="search",
            tools=["search"],
            provider="stub",
            latency_ms=5,
        )
        row = db.execute(select(AgentRun)).scalars().one()
        assert (row.actor_id, row.kind, row.intent, row.provider, row.outcome) == (
            3,
            "assistant",
            "search",
            "stub",
            "ok",
        )
        assert row.tools == ["search"] and row.latency_ms == 5
    finally:
        db.close()


def test_assistant_call_is_traced(client, provider_headers, agent_headers, admin_headers):
    _approved(client, provider_headers)
    assert (
        client.post(
            "/assistant", headers=agent_headers, json={"message": "find events"}
        ).status_code
        == 200
    )

    rows = client.get("/traces", headers=admin_headers).json()
    assert any(r["kind"] == "assistant" and r["provider"] == "stub" for r in rows)
    assert all("message" not in r and "reply" not in r for r in rows)  # content-free


def test_plan_call_is_traced(client, provider_headers, agent_headers, admin_headers):
    eid = _approved(client, provider_headers)
    assert (
        client.post("/builder/plan", headers=agent_headers, json={"item_ids": [eid]}).status_code
        == 200
    )
    rows = client.get("/traces", headers=admin_headers).json()
    assert any(r["kind"] == "plan" for r in rows)


def test_traces_are_admin_only(client, agent_headers, provider_headers):
    assert client.get("/traces", headers=agent_headers).status_code == 403
    assert client.get("/traces", headers=provider_headers).status_code == 403
