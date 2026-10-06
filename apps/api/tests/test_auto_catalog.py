"""Auto-Catalog agent (AC64–AC70).

Hermetic + deterministic: the AI boundary is the deterministic stub (no key) or a recording fake —
never a real provider. PDFs are generated in-test with reportlab (already a dep); fixtures are
synthetic (no real secrets/PII). Contract 4: same document + stub ⇒ identical proposed entries.
"""

from __future__ import annotations

import base64
import json
import logging
from io import BytesIO

from app.ai.base import AIProvider, AIResponse
from app.ai.extract import (
    _coerce_attributes,
    _extract_facts,
    _parse_entries,
    _structure_entries,
    document_text,
    extract_entries,
)
from app.ai.stub import StubProvider
from app.models.catalog import CatalogType, Season

# --------------------------------------------------------------------------------------- helpers


class _RecordingProvider(AIProvider):
    """A non-stub provider that records the prompts it is given and returns canned text."""

    name = "fake"

    def __init__(self, responses: list[str] | None = None) -> None:
        super().__init__("fake-1")
        self.prompts: list[str] = []
        self._responses = list(responses or [])

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        self.prompts.append(prompt)
        text = self._responses.pop(0) if self._responses else ""
        return AIResponse(text=text, provider=self.name, model=self.model)


def _pdf(text: str) -> bytes:
    """A minimal single-page PDF whose drawn lines pypdf can extract back out."""
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf)
    y = 800
    for line in text.splitlines():
        c.drawString(72, y, line)
        y -= 18
    c.save()
    return buf.getvalue()


_FACTS = """\
Galway International Oyster Festival
Type: event
Location: Galway City
Season: autumn
Start date: 2026-09-25
End date: 2026-09-27
Ticket link: https://example.test/tickets
Tags: food, culture
- Freshly shucked oysters
- Live music
The world's longest-running oyster festival.

Cliffs of Moher
Type: place
City: Doolin
Season: year_round
Bogus: should be dropped
A dramatic coastal cliff walk.

Season: winter
"""


def _import(client, headers, data: bytes, filename="doc.pdf", content_type="application/pdf"):
    return client.post(
        "/me/auto-catalog/import",
        headers=headers,
        files={"file": (filename, data, content_type)},
    )


def _job(client, headers, job_id: int) -> dict:
    jobs = client.get("/me/jobs", headers=headers).json()
    return next(j for j in jobs if j["id"] == job_id)


def _run_import(client, headers, data: bytes, filename="doc.pdf", content_type="application/pdf"):
    """POST the async import (AC71), assert it is accepted (202), and return
    ``(finished_job, created_entries)``.

    The TestClient drains the background task synchronously, so by the time the POST returns the job
    is terminal and its draft entries are persisted — the test can read them straight back."""
    res = _import(client, headers, data, filename, content_type)
    assert res.status_code == 202, res.text
    job = res.json()
    final = _job(client, headers, job["id"])
    assert final["status"] == "done", final
    mine = {e["id"]: e for e in client.get("/catalogs/mine/entries", headers=headers).json()}
    entries = [mine[i] for i in final["entry_ids"] if i in mine]
    return final, entries


# ------------------------------------------------------------------------------------------ AC64


def test_import_rejects_bad_type_and_oversize(client, provider_headers, monkeypatch):
    # Wrong content-type is refused at the boundary (AC64).
    bad = _import(client, provider_headers, b"hello", "notes.txt", "text/plain")
    assert bad.status_code == 415, bad.text

    # Oversize is refused with 413 (the 25 MB cap, shrunk here to stay fast + hermetic).
    monkeypatch.setattr("app.uploads.MAX_UPLOAD_BYTES", 8)
    big = _import(client, provider_headers, b"x" * 64, "big.pdf", "application/pdf")
    assert big.status_code == 413, big.text


# ------------------------------------------------------------------------------------------ AC65


def test_extraction_uses_seam_and_pdf_text_local():
    pdf = _pdf("GALWAY-DOC-MARKER\nType: event\nLocation: Galway City")

    # PDF text is extracted locally first...
    text = document_text("doc.pdf", "application/pdf", pdf)
    assert "GALWAY-DOC-MARKER" in text

    # ...then handed to the AC16 seam (the provider's complete() sees that local text).
    fake = _RecordingProvider()
    extract_entries("doc.pdf", "application/pdf", pdf, fake)
    assert fake.prompts, "the extraction stage must call the provider seam"
    assert any("GALWAY-DOC-MARKER" in p for p in fake.prompts)

    # The stub path needs no network and produces stable local text (Contract 4).
    assert document_text("doc.pdf", "application/pdf", pdf) == text


# ------------------------------------------------------------------------------------------ AC66


def test_entries_infer_fields_and_drop_ungrounded():
    entries = _structure_entries(_FACTS, StubProvider())
    # The title-less third block is dropped — never fabricated into an entry.
    assert len(entries) == 2

    festival, cliffs = entries
    assert festival["type"] == CatalogType.event
    assert "Oyster Festival" in festival["title"]
    assert festival["city"] == "Galway City"
    assert festival["country"] == "Ireland"  # filled from the GEO gazetteer (AC53)
    assert festival["season"] == Season.autumn
    assert festival["attributes"]["start_date"] == "2026-09-25"
    assert festival["attributes"]["ticket_url"] == "https://example.test/tickets"
    assert festival["highlights"] == ["Freshly shucked oysters", "Live music"]
    assert festival["market_tags"] == ["food", "culture"]

    assert cliffs["type"] == CatalogType.place
    assert cliffs["title"] == "Cliffs of Moher"
    assert cliffs["season"] == Season.year_round
    # The ungrounded "Bogus:" label is not a place template field, so it is dropped (never kept).
    assert "bogus" not in cliffs["attributes"]
    assert cliffs["attributes"] == {}


# ------------------------------------------------------------------------------------------ AC67


def test_generated_entries_are_drafts_invisible_to_agents(client, provider_headers, agent_headers):
    pdf = _pdf("Dingle Food Festival\nType: event\nLocation: Dingle\nA seafood celebration.")
    job, entries = _run_import(client, provider_headers, pdf)
    assert job["drafts_created"] >= 1
    assert len(entries) == job["drafts_created"]
    generated_ids = {e["id"] for e in entries}
    for e in entries:
        assert e["visibility"] == "draft"
        assert e["status"] == "draft"
        assert e["brand_safe"] is False
        assert e["ai_created"] is True

    # Contract 1: a generated draft reaches no agent until the provider publishes it.
    agent_ids = {e["id"] for e in client.get("/catalog", headers=agent_headers).json()}
    assert generated_ids.isdisjoint(agent_ids)

    # The provider does see them in their own catalog.
    mine = {e["id"] for e in client.get("/catalogs/mine/entries", headers=provider_headers).json()}
    assert generated_ids <= mine


# ------------------------------------------------------------------------------------------ AC68


def test_ai_created_marker_and_filter(client, provider_headers):
    pdf = _pdf("Clifden Arts Festival\nType: event\nLocation: Clifden\nAn arts week.")
    _, gen_entries = _run_import(client, provider_headers, pdf)
    generated_ids = {e["id"] for e in gen_entries}

    cid = client.get("/catalogs/mine", headers=provider_headers).json()["id"]
    manual = client.post(
        "/catalog",
        headers=provider_headers,
        json={"catalog_id": cid, "type": "place", "title": "Hand made",
              "description": "d", "destination": "Cork"},
    ).json()
    assert manual["ai_created"] is False

    ai_only = client.get(
        "/catalogs/mine/entries?ai_created=true", headers=provider_headers
    ).json()
    assert {e["id"] for e in ai_only} == generated_ids
    assert all(e["ai_created"] is True for e in ai_only)

    manual_only = client.get(
        "/catalogs/mine/entries?ai_created=false", headers=provider_headers
    ).json()
    manual_ids = {e["id"] for e in manual_only}
    assert manual["id"] in manual_ids
    assert generated_ids.isdisjoint(manual_ids)


# ------------------------------------------------------------------------------------------ AC69


def test_generated_draft_edited_and_published(client, provider_headers, agent_headers):
    pdf = _pdf("Westport Food Festival\nType: event\nLocation: Westport\nA food weekend.")
    _, gen_entries = _run_import(client, provider_headers, pdf)
    entry_id = gen_entries[0]["id"]

    # Reuse the existing entry editor (AC29) to review/correct the generated draft.
    edited = client.put(
        f"/catalog/{entry_id}",
        headers=provider_headers,
        json={"title": "Westport Food Festival (verified)"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["title"] == "Westport Food Festival (verified)"

    # Publish it public via the existing AC54 visibility control — now it reaches agents.
    pub = client.patch(
        f"/catalog/{entry_id}", headers=provider_headers, json={"visibility": "public"}
    )
    assert pub.status_code == 200 and pub.json()["visibility"] == "public"
    agent_ids = {e["id"] for e in client.get("/catalog", headers=agent_headers).json()}
    assert entry_id in agent_ids


# ------------------------------------------------------------------------------------------ AC70


def test_determinism_and_no_pii_in_logs(client, provider_headers, caplog):
    pdf = _pdf(_FACTS)
    # Same document + stub ⇒ identical proposed entries (Contract 4).
    first = extract_entries("doc.pdf", "application/pdf", pdf, StubProvider())
    second = extract_entries("doc.pdf", "application/pdf", pdf, StubProvider())
    assert first == second
    assert len(first) >= 1

    # No raw document text / PII is written to logs — only counts + the provider name.
    marker = "PII-SECRET-TOKEN-998877"
    doc = _pdf(f"{marker} Festival\nType: event\nLocation: Galway City")
    with caplog.at_level(logging.INFO):
        job, _entries = _run_import(client, provider_headers, doc)
    assert job["status"] == "done"
    assert marker not in caplog.text


# ------------------------------------------------- real-provider structured JSON path (AC65/AC66)


def test_structure_entries_parses_real_provider_json():
    """A non-stub provider's JSON array is parsed + normalized (not dropped to the heuristic)."""
    payload = json.dumps(
        [
            {
                "type": "event",
                "title": "Galway Oyster Festival",
                "description": "A seafood celebration.",
                "destination": "Galway City",
                "country": "Ireland",
                "city": "Galway City",
                "season": "autumn",
                "attributes": {
                    "start_date": "2026-09-25",
                    "ticket_url": "https://example.test/tickets",
                },
                "highlights": ["Freshly shucked oysters", "Live music"],
                "market_tags": ["food", "culture"],
            }
        ]
    )
    fake = _RecordingProvider(responses=[payload])
    entries = _structure_entries("some grounded facts", fake)

    assert fake.prompts, "a real provider must be asked to structure the facts"
    assert len(entries) == 1
    e = entries[0]
    assert e["type"] == CatalogType.event  # coerced from the "event" string to the enum
    assert e["title"] == "Galway Oyster Festival"
    assert e["season"] == Season.autumn
    assert e["attributes"] == {
        "start_date": "2026-09-25",
        "ticket_url": "https://example.test/tickets",
    }
    assert e["highlights"] == ["Freshly shucked oysters", "Live music"]
    assert e["market_tags"] == ["food", "culture"]


def test_parse_entries_handles_malformed_and_wrapped_shapes():
    """Malformed JSON, dict-wrapper unwrap, non-dict skipping and the _MAX_ENTRIES cap."""
    # Malformed / empty text degrades to [] — it never raises.
    assert _parse_entries("not valid json {{{") == []
    assert _parse_entries("") == []

    one = {"type": "place", "title": "Cliffs of Moher"}

    # Bare array, and both dict-wrapper shapes the model may emit, parse the same.
    assert len(_parse_entries(json.dumps([one]))) == 1
    assert len(_parse_entries(json.dumps({"entries": [one]}))) == 1
    assert len(_parse_entries(json.dumps({"items": [one]}))) == 1
    # A dict with neither key unwraps to None → not a list → [].
    assert _parse_entries(json.dumps({"nope": [one]})) == []

    # Non-dict items (and title-less dicts) are skipped; only the valid entry survives.
    mixed = _parse_entries(json.dumps([123, "x", None, one, {"description": "no title"}]))
    assert len(mixed) == 1
    assert mixed[0]["title"] == "Cliffs of Moher"
    assert mixed[0]["type"] == CatalogType.place

    # A flood of valid entries is capped at _MAX_ENTRIES (25).
    flood = [{"type": "place", "title": f"Place {i}"} for i in range(40)]
    assert len(_parse_entries(json.dumps(flood))) == 25


def test_extract_entries_runs_both_provider_stages():
    """End-to-end with a real provider: stage 1 distils facts, stage 2 structures them."""
    pdf = _pdf("Galway International Oyster Festival\nType: event\nLocation: Galway City")
    structured = json.dumps(
        [
            {
                "type": "event",
                "title": "Galway International Oyster Festival",
                "destination": "Galway City",
                "city": "Galway City",
                "country": "Ireland",
                "season": "autumn",
            }
        ]
    )
    # Stage 1 returns distilled facts; stage 2 returns the structured JSON array.
    fake = _RecordingProvider(
        responses=["Galway International Oyster Festival\nType: event", structured]
    )
    entries = extract_entries("doc.pdf", "application/pdf", pdf, fake)

    assert len(fake.prompts) == 2, "both the extract and structure stages call the seam"
    assert len(entries) == 1
    assert entries[0]["title"] == "Galway International Oyster Festival"
    assert entries[0]["type"] == CatalogType.event
    # Stage 2 structures stage 1's distilled output, not the raw PDF text.
    assert "Galway International Oyster Festival" in fake.prompts[1]


def test_extract_facts_prefers_distilled_else_falls_back():
    """Stage 1: a non-empty provider distillation replaces local text; an empty one falls back."""
    fake = _RecordingProvider(responses=["DISTILLED FACTS"])
    assert _extract_facts("raw local text", fake) == "DISTILLED FACTS"
    assert fake.prompts, "a real provider must be asked to distil facts"

    empty = _RecordingProvider(responses=[""])
    assert _extract_facts("raw local text", empty) == "raw local text"


# --------------------------------------------------------- attribute grounding safety (AC66)


def test_coerce_attributes_drops_illtyped_template_values():
    """The grounding guard drops non-numeric/url/date values; well-typed ones are kept."""
    dropped = _coerce_attributes(
        CatalogType.event,
        {"expected_attendance": "loads", "ticket_url": "just-text", "start_date": "someday"},
    )
    assert dropped == {}

    kept = _coerce_attributes(
        CatalogType.event,
        {"expected_attendance": "1200", "ticket_url": "https://x.test", "start_date": "2026-01-01"},
    )
    assert kept == {
        "expected_attendance": "1200",
        "ticket_url": "https://x.test",
        "start_date": "2026-01-01",
    }

    # A non-dict attributes value coerces to {} rather than raising.
    assert _coerce_attributes(CatalogType.event, "nope") == {}


def test_block_with_illtyped_attribute_drops_it():
    """A block whose template field carries an ill-typed value yields empty attributes."""
    facts = (
        "Spring Music Festival\n"
        "Type: event\n"
        "Location: Galway City\n"
        "Expected attendance: lots\n"  # number field, non-numeric → dropped
        "Ticket link: not-a-link\n"  # url field, no scheme → dropped
    )
    entries = _structure_entries(facts, StubProvider())
    assert len(entries) == 1
    assert entries[0]["type"] == CatalogType.event
    assert entries[0]["attributes"] == {}


# ----------------------------------------------- corrupt-PDF safe degradation (AC64/AC65)


def test_corrupt_pdf_degrades_to_empty_text(client, provider_headers):
    """An un-extractable PDF returns "" (never raises) and /import stays 201 with 0 entries."""
    junk = b"%PDF-1.4\nthis is not a real pdf \x00\x01\x02 garbage bytes"
    assert document_text("broken.pdf", "application/pdf", junk) == ""

    job, entries = _run_import(client, provider_headers, junk, "broken.pdf", "application/pdf")
    assert job["status"] == "done"
    assert job["drafts_created"] == 0
    assert entries == []


# ------------------------------------------------------------ image import (AC65)

# A 1x1 transparent PNG — bytes are never parsed (no OCR in this PoC); the filename seeds the draft.
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def test_image_import_yields_draft(client, provider_headers):
    """An image is accepted; its filename stem deterministically seeds a draft entry (AC65)."""
    stem = document_text("dingle-food-festival.png", "image/png", _PNG_1x1)
    assert stem == "dingle food festival"

    job, entries = _run_import(
        client, provider_headers, _PNG_1x1, "dingle-food-festival.png", "image/png"
    )
    assert job["drafts_created"] >= 1
    entry = entries[0]
    assert entry["ai_created"] is True
    assert entry["visibility"] == "draft"
    assert "festival" in entry["title"].lower()
