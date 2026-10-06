"""Auto-Catalog agent (AC64–AC70).

Hermetic + deterministic: the AI boundary is the deterministic stub (no key) or a recording fake —
never a real provider. PDFs are generated in-test with reportlab (already a dep); fixtures are
synthetic (no real secrets/PII). Contract 4: same document + stub ⇒ identical proposed entries.
"""

from __future__ import annotations

import logging
from io import BytesIO

from app.ai.base import AIProvider, AIResponse
from app.ai.extract import _structure_entries, document_text, extract_entries
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
    res = _import(client, provider_headers, pdf)
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["count"] >= 1
    generated_ids = {e["id"] for e in body["entries"]}
    for e in body["entries"]:
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
    gen = _import(client, provider_headers, pdf).json()
    generated_ids = {e["id"] for e in gen["entries"]}

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
    gen = _import(client, provider_headers, pdf).json()
    entry_id = gen["entries"][0]["id"]

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
        res = _import(client, provider_headers, doc)
    assert res.status_code == 201, res.text
    assert marker not in caplog.text
