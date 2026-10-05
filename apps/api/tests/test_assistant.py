"""AC38–AC40 — Content Assistant, natural-language search, suggested next posts.

Hermetic + deterministic: test settings carry no provider key, so the AC16 stub provider is used and
the assistant's grounded reply is reproducible. The clock is pinned via app.clock.now.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app import clock
from app.agents.assistant import _classify, run_assistant
from app.ai.base import AIProvider, AIResponse
from app.models.user import Role, User

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


class _FakeProvider(AIProvider):
    """A non-stub provider (so the real-provider branch runs): returns a canned reply or raises."""

    name = "fake"

    def __init__(self, *, text: str = "", raises: bool = False) -> None:
        super().__init__("fake-1")
        self._text = text
        self._raises = raises
        self.prompts: list[str] = []

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        self.prompts.append(prompt)
        if self._raises:
            raise RuntimeError("provider down")
        return AIResponse(text=self._text, provider=self.name, model=self.model)


def _agent_user(app) -> tuple[object, User]:
    db = app.state.sessionmaker()
    agent = db.execute(select(User).where(User.role == Role.tourism_agent)).scalars().first()
    return db, agent


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _entry(
    client, provider_headers, *, title, destination, type_="event", approve=True, expires=None
):
    body = {"type": type_, "title": title, "destination": destination}
    if expires is not None:
        body["expires_at"] = expires.isoformat()
    r = client.post("/catalog", headers=provider_headers, json=body)
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    if approve:
        assert (
            client.patch(
                f"/catalog/{entry_id}",
                headers=provider_headers,
                json={"status": "approved", "brand_safe": True},
            ).status_code
            == 200
        )
    return entry_id


# ----------------------------------------------------------------- AC38 assistant


def test_assistant_grounds_reply_in_visible_items(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Harbour Festival", destination="Galway")

    r = client.post("/assistant", headers=agent_headers, json={"message": "find events in Galway"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "search"
    assert any(i["title"] == "Harbour Festival" for i in body["items"])
    assert "Harbour Festival" in body["reply"]
    # Grounded: it offers to act on real items, and never invents a place not in the results.
    assert body["suggestion"]["action"] == "studio"
    assert "Paris" not in body["reply"]


def test_assistant_never_surfaces_hidden_content(client, provider_headers, agent_headers, app):
    """Draft (unapproved) and off-limits items must not appear via the assistant (Contract 1)."""
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Secret Draft Expo", destination="Galway", approve=False)
    blocked_id = _entry(client, provider_headers, title="Volcano Tour", destination="Galway")
    client.post("/blocklist", headers=provider_headers, json={"term": "volcano"})

    r = client.post("/assistant", headers=agent_headers, json={"message": "what's on in Galway?"})
    assert r.status_code == 200, r.text
    titles = {i["title"] for i in r.json()["items"]}
    assert "Secret Draft Expo" not in titles
    assert "Volcano Tour" not in titles
    assert all(i["id"] != blocked_id for i in r.json()["items"])


def test_assistant_is_agent_only(client, provider_headers, admin_headers):
    for headers in (provider_headers, admin_headers):
        assert client.post("/assistant", headers=headers, json={"message": "hi"}).status_code == 403


# ----------------------------------------------------------------- AC39 NL search


def test_natural_language_search_matches_type_and_destination(
    client, provider_headers, agent_headers, app
):
    _fix_clock(app, T0)
    _entry(client, provider_headers, type_="place", title="Cliffs of Moher", destination="Clare")
    _entry(client, provider_headers, type_="event", title="Dublin Marathon", destination="Dublin")

    r = client.post(
        "/assistant", headers=agent_headers, json={"message": "show me places in Clare"}
    )
    assert r.status_code == 200, r.text
    titles = [i["title"] for i in r.json()["items"]]
    assert "Cliffs of Moher" in titles
    assert "Dublin Marathon" not in titles  # a Dublin event is not a Clare place


# ----------------------------------------------------------------- AC40 suggestions


def test_suggestions_exclude_used_and_hidden(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    unused = _entry(client, provider_headers, title="Kerry Gardens", destination="Kerry")
    used = _entry(client, provider_headers, title="Mayo Greenway", destination="Mayo")
    _entry(
        client,
        provider_headers,
        title="Expired Fair",
        destination="Sligo",
        expires=T0 - timedelta(days=1),
    )

    # Agent uses one item in a saved project.
    assert (
        client.post(
            "/me/projects", headers=agent_headers, json={"name": "Trip", "item_ids": [used]}
        ).status_code
        == 201
    )

    r = client.get("/me/suggestions", headers=agent_headers)
    assert r.status_code == 200, r.text
    ids = {i["id"] for i in r.json()["items"]}
    assert unused in ids  # unused + current → suggested
    assert used not in ids  # already used → not suggested
    assert all(i["display_status"] != "expired" for i in r.json()["items"])  # hidden items excluded
    assert all(i["reason"] for i in r.json()["items"])  # every suggestion explains itself


def test_suggestions_are_agent_only(client, provider_headers):
    assert client.get("/me/suggestions", headers=provider_headers).status_code == 403


# ----------------------------------------------------------------- intent routing


@pytest.mark.parametrize(
    "message,intent",
    [
        ("find events in Galway", "search"),
        ("show me places in Clare", "search"),
        ("harbour", "search"),
        ("what's on in Galway?", "answer"),
        ("when does it start", "answer"),
        ("suggest something to post", "suggest"),
        ("what should I post this week", "suggest"),
        ("recommend content", "suggest"),
        ("however did that happen", "search"),  # 'however' is not a question word
        ("the ideal beach", "search"),  # 'ideal' is not 'idea'
    ],
)
def test_classify_routes_on_word_boundaries(message, intent):
    assert _classify(message) == intent


def test_assistant_suggest_intent_offers_unused_items(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Kerry Gardens", destination="Kerry")
    used = _entry(client, provider_headers, title="Mayo Greenway", destination="Mayo")
    assert (
        client.post(
            "/me/projects", headers=agent_headers, json={"name": "Trip", "item_ids": [used]}
        ).status_code
        == 201
    )

    r = client.post(
        "/assistant", headers=agent_headers, json={"message": "suggest something to post"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "suggest"
    assert body["items"] and all(i["reason"] for i in body["items"])
    assert body["suggestion"]["action"] == "studio"
    assert all(i["title"] != "Mayo Greenway" for i in body["items"])  # used item excluded


def test_assistant_answer_intent_has_no_cta(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Harbour Festival", destination="Galway")
    r = client.post("/assistant", headers=agent_headers, json={"message": "what's on in Galway?"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["intent"] == "answer"
    assert body["suggestion"] is None
    assert "Want me to" not in body["reply"]


def test_assistant_empty_results_say_so(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    # Only a DRAFT Galway event exists → nothing visible → a clear "couldn't find" reply.
    _entry(client, provider_headers, title="Draft Only Expo", destination="Galway", approve=False)
    r = client.post("/assistant", headers=agent_headers, json={"message": "find events in Galway"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["items"] == []
    assert "couldn't find" in body["reply"].lower()
    assert body["suggestion"] is None


# ----------------------------------------------------------------- real-provider grounding (AC38)


def test_real_provider_reply_must_stay_grounded(client, provider_headers, app):
    """A real provider's wording is used only when grounded; ungrounded/injected/errored → base."""
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Harbour Festival", destination="Galway")
    db, agent = _agent_user(app)
    try:
        # Grounded rewrite (mentions the real item) is accepted verbatim.
        grounded = _FakeProvider(text="Check out Harbour Festival — a lovely day out!")
        res = run_assistant(db, agent, "find events in Galway", grounded, now=T0)
        assert res.reply == "Check out Harbour Festival — a lovely day out!"
        assert grounded.prompts and "Harbour Festival" in grounded.prompts[0]

        # Ungrounded (invents a place, no real title) → falls back to the grounded base text.
        ungrounded = run_assistant(
            db, agent, "find events in Galway", _FakeProvider(text="Visit Paris and Tokyo!"), now=T0
        )
        assert "Harbour Festival" in ungrounded.reply and "Paris" not in ungrounded.reply

        # Injected link → rejected → base.
        linked = run_assistant(
            db,
            agent,
            "find events in Galway",
            _FakeProvider(text="Harbour Festival! Book at http://evil.example"),
            now=T0,
        )
        assert "http" not in linked.reply

        # Provider error and empty text both fall back to base.
        assert (
            "Harbour Festival"
            in run_assistant(
                db, agent, "find events in Galway", _FakeProvider(raises=True), now=T0
            ).reply
        )
        assert (
            "Harbour Festival"
            in run_assistant(
                db, agent, "find events in Galway", _FakeProvider(text="   "), now=T0
            ).reply
        )
    finally:
        db.close()


# ----------------------------------------------------------------- more NL search / suggestions


def test_nl_search_type_only_and_keyword_and_case(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(
        client, provider_headers, type_="itinerary", title="Wild Atlantic Way", destination="Mayo"
    )
    _entry(client, provider_headers, type_="event", title="Harbour Festival", destination="Galway")

    # Type-only query returns only that type.
    only_itin = client.post(
        "/assistant", headers=agent_headers, json={"message": "show me itineraries"}
    ).json()["items"]
    assert only_itin and all(i["type"] == "itinerary" for i in only_itin)

    # Case-insensitive destination match.
    galway = client.post(
        "/assistant", headers=agent_headers, json={"message": "anything in GALWAY"}
    ).json()["items"]
    assert any(i["title"] == "Harbour Festival" for i in galway)

    # Keyword-only query matches the title.
    kw = client.post("/assistant", headers=agent_headers, json={"message": "harbour"}).json()[
        "items"
    ]
    assert any(i["title"] == "Harbour Festival" for i in kw)


def test_suggestions_rank_expiring_first_and_cap(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(
        client,
        provider_headers,
        title="Soon To Go",
        destination="Clare",
        expires=T0 + timedelta(days=5),
    )
    for i in range(6):
        _entry(client, provider_headers, title=f"Evergreen {i}", destination="Kerry")

    items = client.get("/me/suggestions", headers=agent_headers).json()["items"]
    assert len(items) == 5  # capped
    assert items[0]["title"] == "Soon To Go"  # expiring-soon ranked first
    assert items[0]["reason"].startswith("Expiring soon")


def test_suggestions_exclude_draft_and_off_limits(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    _entry(client, provider_headers, title="Good Pick", destination="Kerry")
    _entry(client, provider_headers, title="Draft Pick", destination="Kerry", approve=False)
    _entry(client, provider_headers, title="Volcano Pick", destination="Kerry")
    client.post("/blocklist", headers=provider_headers, json={"term": "volcano"})

    titles = {
        i["title"] for i in client.get("/me/suggestions", headers=agent_headers).json()["items"]
    }
    assert "Good Pick" in titles
    assert "Draft Pick" not in titles
    assert "Volcano Pick" not in titles
