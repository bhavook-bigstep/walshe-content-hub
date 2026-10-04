"""AC41/AC42 — Creative Plan IR + claim-grounding validation. Hermetic + deterministic (stub)."""

from __future__ import annotations

from datetime import datetime, timezone

from app import clock
from app.agents.creative_plan import CreativeBrief, _ground_claim, build_plan, validate_plan
from app.ai.base import AIProvider, AIResponse
from app.models.catalog import CatalogEntry

T0 = datetime(2026, 6, 1, tzinfo=timezone.utc)


def _fix_clock(app, instant: datetime) -> None:
    app.dependency_overrides[clock.now] = lambda: instant


def _approved(client, provider_headers, *, title, destination, description="", highlights=None):
    body = {
        "type": "event",
        "title": title,
        "destination": destination,
        "description": description,
        "highlights": highlights or [],
    }
    r = client.post("/catalog", headers=provider_headers, json=body)
    assert r.status_code == 201, r.text
    eid = r.json()["id"]
    assert (
        client.patch(
            f"/catalog/{eid}",
            headers=provider_headers,
            json={"status": "approved", "brand_safe": True},
        ).status_code
        == 200
    )
    return eid


class _FakeProvider(AIProvider):
    name = "fake"

    def __init__(self, text: str, *, raises: bool = False) -> None:
        super().__init__("fake-1")
        self._text = text
        self._raises = raises

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        if self._raises:
            raise RuntimeError("provider down")
        return AIResponse(text=self._text, provider=self.name, model=self.model)


def _entries(app, ids: list[int]):
    db = app.state.sessionmaker()
    return [db.get(CatalogEntry, i) for i in ids], db


# ------------------------------------------------------------------- AC41 (endpoint)


def test_plan_built_from_visible_items_and_serialises(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    eid = _approved(
        client,
        provider_headers,
        title="Harbour Festival",
        destination="Galway",
        description="A lively harbour festival on Galway bay with music and food.",
        highlights=["Family friendly", "On the waterfront"],
    )
    r = client.post(
        "/builder/plan", headers=agent_headers, json={"item_ids": [eid], "format": "social"}
    )
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["item_ids"] == [eid]
    assert plan["ad_copy"]["headline"] == "Harbour Festival"
    assert plan["supporting_points"]  # grounded from highlights
    assert plan["ready"] is True
    assert plan["sources"] and all(s["grounded"] for s in plan["sources"])


def test_plan_refuses_hidden_items(client, provider_headers, agent_headers, app):
    _fix_clock(app, T0)
    visible = _approved(client, provider_headers, title="Open Event", destination="Cork")
    # A draft entry is not visible to the agent.
    draft = client.post(
        "/catalog",
        headers=provider_headers,
        json={"type": "event", "title": "Hidden", "destination": "Cork"},
    ).json()["id"]

    r = client.post("/builder/plan", headers=agent_headers, json={"item_ids": [visible, draft]})
    assert r.status_code == 200, r.text
    assert r.json()["item_ids"] == [visible]  # the hidden/draft id is dropped

    # All ids hidden → nothing to plan from.
    only_hidden = client.post("/builder/plan", headers=agent_headers, json={"item_ids": [draft]})
    assert only_hidden.status_code == 404


def test_plan_is_agent_only(client, provider_headers):
    assert (
        client.post("/builder/plan", headers=provider_headers, json={"item_ids": [1]}).status_code
        == 403
    )


# ------------------------------------------------------------------- AC42 (validator + gate)


def _mk(entry_id: int, title: str, description: str, highlights=None) -> CatalogEntry:
    """An in-memory (unsaved) entry — enough for the pure validator to read its source fields."""
    return CatalogEntry(
        id=entry_id,
        title=title,
        description=description,
        destination="Clare",
        highlights=highlights or [],
        custom_sections=[],
        attributes={},
    )


def _plan_with(headline: str, body: str = ""):
    from app.agents.creative_plan import CreativeCopy, CreativePlan

    return CreativePlan(
        brief=CreativeBrief("awareness", "social", "", []),
        message_primary="",
        supporting_points=[],
        visual_asset_keys=[],
        copy=CreativeCopy(headline=headline, body=body, cta="Learn more"),
    )


def test_grounded_plan_passes_with_evidence_links():
    """Direct validator: a claim drawn from an approved field is grounded + linked to that field."""
    items = [_mk(7, "Cliffs of Moher", "Dramatic sea cliffs on the Wild Atlantic Way.")]
    plan = validate_plan(_plan_with("Cliffs of Moher", "Dramatic sea cliffs"), items)
    assert plan.ready is True
    assert plan.sources and all(s.grounded for s in plan.sources)
    sea = next(s for s in plan.sources if "sea cliffs" in s.claim.lower())
    assert sea.evidence_item_id == 7 and sea.evidence_field == "description"


def test_ungrounded_claim_is_flagged_with_evidence_gap():
    """Direct validator: fabricated claims (invented words + fabricated numbers) are flagged."""
    items = [_mk(7, "Cliffs of Moher", "Dramatic sea cliffs on the Wild Atlantic Way.")]
    plan = validate_plan(
        _plan_with("Save 70% on helicopter tours", "Book Tokyo flights now"), items
    )
    assert plan.ready is False
    assert plan.issues
    ungrounded = [s for s in plan.sources if not s.grounded]
    assert ungrounded and all(
        s.evidence_item_id is None and s.evidence_field is None for s in ungrounded
    )


def test_grounding_is_word_level_and_numeric_strict():
    items = [_mk(1, "Garden Party", "A lovely garden event in Clare.")]
    # Substring must NOT ground: "art" is inside "party" but is not the same word.
    assert _ground_claim("art show", items).grounded is False
    # A fabricated number is a hard fail even if the words match.
    assert _ground_claim("garden event 50% off", items).grounded is False
    # A real, supported phrase grounds.
    assert _ground_claim("lovely garden event", items).grounded is True


def test_validate_plan_marks_empty_item_set_not_ready():
    assert validate_plan(_plan_with("Anything"), []).ready is False


# --- the gate: ungrounded/errored AI copy never reaches the returned plan ---


def test_build_plan_uses_grounded_base_from_stub(client, provider_headers, app):
    _fix_clock(app, T0)
    eid = _approved(
        client,
        provider_headers,
        title="Cliffs of Moher",
        destination="Clare",
        description="Dramatic sea cliffs on the Wild Atlantic Way.",
        highlights=["Stunning views"],
    )
    rows, db = _entries(app, [eid])
    try:
        plan = build_plan(rows, CreativeBrief("awareness", "social", "", [eid]), _StubLike())
        assert plan.ready is True and plan.copy.headline == "Cliffs of Moher"
        assert any(s.evidence_item_id == eid for s in plan.sources)
    finally:
        db.close()


def test_build_plan_rejects_ungrounded_ai_draft(client, provider_headers, app):
    _fix_clock(app, T0)
    eid = _approved(
        client,
        provider_headers,
        title="Cliffs of Moher",
        destination="Clare",
        description="Dramatic sea cliffs on the Wild Atlantic Way.",
    )
    rows, db = _entries(app, [eid])
    try:
        fake = _FakeProvider("HEADLINE: Save 70% on helicopter tours\nBODY: Book Tokyo flights now")
        plan = build_plan(rows, CreativeBrief("awareness", "social", "", [eid]), fake)
        # The invented copy is discarded; the grounded base is used, and the rejection is recorded.
        assert plan.copy.headline == "Cliffs of Moher"
        assert "70%" not in plan.copy.body and "Tokyo" not in plan.copy.body
        assert any("rejected" in i.lower() for i in plan.issues)
        assert plan.ready is True  # the returned copy is grounded
    finally:
        db.close()


def test_build_plan_accepts_grounded_ai_rephrase(client, provider_headers, app):
    _fix_clock(app, T0)
    eid = _approved(
        client,
        provider_headers,
        title="Cliffs of Moher",
        destination="Clare",
        description="Dramatic sea cliffs on the Wild Atlantic Way.",
    )
    rows, db = _entries(app, [eid])
    try:
        fake = _FakeProvider("HEADLINE: Cliffs of Moher\nBODY: Dramatic sea cliffs")
        plan = build_plan(rows, CreativeBrief("awareness", "social", "", [eid]), fake)
        assert plan.ready is True and plan.copy.body == "Dramatic sea cliffs"
    finally:
        db.close()


def test_build_plan_falls_back_on_provider_error(client, provider_headers, app):
    _fix_clock(app, T0)
    eid = _approved(
        client,
        provider_headers,
        title="Cliffs of Moher",
        destination="Clare",
        description="Sea cliffs.",
    )
    rows, db = _entries(app, [eid])
    try:
        plan = build_plan(
            rows, CreativeBrief("awareness", "social", "", [eid]), _FakeProvider("", raises=True)
        )
        assert plan.ready is True and plan.copy.headline == "Cliffs of Moher"
    finally:
        db.close()


def test_parse_copy_variants():
    from app.agents.creative_plan import _parse_copy

    assert _parse_copy("garbage", "H", "B") == ("H", "B")
    assert _parse_copy("HEADLINE: X", "H", "B") == ("X", "B")
    assert _parse_copy("headline:   \nBODY: Y", "H", "B") == ("H", "Y")
    assert _parse_copy("HEADLINE: A: B", "H", "B") == ("A: B", "B")


class _StubLike(AIProvider):
    """Stands in for the deterministic stub (build_plan uses base grounded copy)."""

    name = "stub"

    def __init__(self) -> None:
        super().__init__("stub-1")

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:  # pragma: no cover
        return AIResponse(text="", provider=self.name, model=self.model)
