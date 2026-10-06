"""Auto-Catalog agent v2 — async jobs, image extraction, tool-call insert (AC71–AC73) + the
provider-failure fallback regression (the live ⏸G fix).

Hermetic + deterministic (Contract 4): the AI boundary is the deterministic stub (no key) or a
recording/raising fake — never a real provider. PDFs (with and without an embedded image) are
generated in-test with reportlab; the embedded raster is a tiny synthetic PNG. No real secrets/PII.

Under the TestClient a FastAPI ``BackgroundTask`` drains synchronously, so once the 202 POST returns
the job is terminal and its drafts are persisted — the test reads them straight back.
"""

from __future__ import annotations

import base64
from io import BytesIO

from app.ai.base import AIProvider, AIResponse
from app.ai.catalog_agent import IMAGE_INDEX_KEY, plan_entries
from app.ai.extract import extract_entries, extract_images_from_pdf
from app.ai.stub import StubProvider
from app.models.catalog import CatalogType

# A real 2x2 PNG so reportlab actually embeds a raster PyMuPDF can extract back out.
_PNG_2x2 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AE"
    "YBxVSFsAAE9aBf0kB4zqAAAAAElFTkSuQmCC"
)
# A 1x1 transparent PNG for the direct-image-upload candidate path.
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
    "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


class _RecordingProvider(AIProvider):
    """A non-stub provider that returns canned text per ``complete`` call."""

    name = "fake"

    def __init__(self, responses: list[str] | None = None) -> None:
        super().__init__("fake-1")
        self.prompts: list[str] = []
        self._responses = list(responses or [])

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        self.prompts.append(prompt)
        text = self._responses.pop(0) if self._responses else ""
        return AIResponse(text=text, provider=self.name, model=self.model)


class _RaisingProvider(AIProvider):
    """A non-stub provider whose ``complete`` always fails — simulates a timeout/HTTP error."""

    name = "flaky"

    def __init__(self) -> None:
        super().__init__("flaky-1")

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        raise TimeoutError("read timed out")


def _pdf(text: str, png: bytes | None = None) -> bytes:
    """A single-page PDF pypdf can read back; optionally embeds one raster image."""
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    buf = BytesIO()
    c = canvas.Canvas(buf)
    y = 800
    for line in text.splitlines():
        c.drawString(72, y, line)
        y -= 18
    if png is not None:
        c.drawImage(ImageReader(BytesIO(png)), 72, 500, width=120, height=120)
    c.save()
    return buf.getvalue()


def _import(client, headers, data, filename="doc.pdf", content_type="application/pdf"):
    return client.post(
        "/me/auto-catalog/import", headers=headers, files={"file": (filename, data, content_type)}
    )


def _job(client, headers, job_id):
    return next(j for j in client.get("/me/jobs", headers=headers).json() if j["id"] == job_id)


def _mine(client, headers):
    """The provider's own entries as an ``{id: entry}`` map."""
    return {e["id"]: e for e in client.get("/catalogs/mine/entries", headers=headers).json()}


# --------------------------------------------------------------------------------- AC71 (async job)


def test_import_returns_202_and_job_lists_done(client, provider_headers, agent_headers):
    pdf = _pdf("Galway Oyster Festival\nType: event\nLocation: Galway City\nA seafood celebration.")
    res = _import(client, provider_headers, pdf)
    assert res.status_code == 202, res.text  # accepted immediately, not 201
    queued = res.json()
    assert queued["status"] in {"queued", "running", "done"}
    assert queued["kind"] == "auto_catalog_import"
    assert queued["filename"] == "doc.pdf"

    # The background task has already run under the TestClient → the job is done with its drafts.
    final = _job(client, provider_headers, queued["id"])
    assert final["status"] == "done"
    assert final["drafts_created"] >= 1
    assert len(final["entry_ids"]) == final["drafts_created"]
    assert final["error"] == ""

    # Owner-scoped: /me/jobs is provider-only (an agent is refused by the role guard).
    assert client.get("/me/jobs", headers=agent_headers).status_code == 403


def test_failed_job_records_safe_reason_no_pii(client, provider_headers, monkeypatch):
    """If the background work raises, the job is marked failed with a short, content-free reason."""
    marker = "PII-SECRET-TOKEN-55221"

    def _boom(*args, **kwargs):
        raise RuntimeError(f"boom with {marker}")

    # Force the extraction to raise *inside* the task (after the 202) to exercise the failure path.
    monkeypatch.setattr("app.services.auto_catalog_jobs.document_images", _boom)
    res = _import(client, provider_headers, _pdf(f"{marker} Festival\nType: event"))
    assert res.status_code == 202, res.text
    final = _job(client, provider_headers, res.json()["id"])
    assert final["status"] == "failed"
    assert final["drafts_created"] == 0
    # The reason is the exception *type*, never its message — no document text / PII leaks.
    assert final["error"] == "RuntimeError"
    assert marker not in final["error"]


# ---------------------------------------------------------------------------- AC72 (image → MinIO)


def test_extract_images_from_pdf_and_degrades_cleanly():
    with_image = extract_images_from_pdf(_pdf("Galway Oyster Festival", png=_PNG_2x2))
    assert len(with_image) == 1
    data, content_type = with_image[0]
    assert content_type in {"image/png", "image/jpeg"}
    assert len(data) > 0

    # A text-only PDF yields no images; a corrupt PDF degrades to [] (never raises).
    assert extract_images_from_pdf(_pdf("Galway Oyster Festival")) == []
    assert extract_images_from_pdf(b"%PDF-1.4 not really a pdf \x00\x01") == []


def test_pdf_images_extracted_to_storage_and_attached(client, provider_headers):
    pdf = _pdf("Galway Oyster Festival\nType: event\nLocation: Galway City", png=_PNG_2x2)
    res = _import(client, provider_headers, pdf)
    assert res.status_code == 202, res.text
    final = _job(client, provider_headers, res.json()["id"])
    assert final["status"] == "done" and final["drafts_created"] >= 1

    entry = _mine(client, provider_headers)[final["entry_ids"][0]]
    key = entry["cover_object_key"]
    assert key.startswith(f"entries/{entry['id']}/cover/")  # stored under the entry/asset key

    # The stored image is served back through the existing media route to its owner (AC72).
    fetched = client.get(f"/assets/{key}", headers=provider_headers)
    assert fetched.status_code == 200
    assert fetched.content  # bytes come back


def test_png_upload_is_its_own_candidate_image(client, provider_headers):
    res = _import(client, provider_headers, _PNG_1x1, "dingle-festival.png", "image/png")
    assert res.status_code == 202, res.text
    final = _job(client, provider_headers, res.json()["id"])
    assert final["status"] == "done" and final["drafts_created"] >= 1

    entry = _mine(client, provider_headers)[final["entry_ids"][0]]
    assert entry["cover_object_key"].startswith(f"entries/{entry['id']}/cover/")
    cover = client.get(f"/assets/{entry['cover_object_key']}", headers=provider_headers)
    assert cover.status_code == 200


def test_pdf_without_images_degrades_no_cover(client, provider_headers):
    pdf = _pdf("Cliffs of Moher\nType: place\nLocation: Doolin\nA coastal cliff walk.")
    res = _import(client, provider_headers, pdf)
    final = _job(client, provider_headers, res.json()["id"])
    assert final["status"] == "done" and final["drafts_created"] >= 1
    entry = _mine(client, provider_headers)[final["entry_ids"][0]]
    assert entry["cover_object_key"] == ""  # no usable image → no cover (clean degrade)


# ------------------------------------------------------------------------ AC73 (tool-call insert)


def test_tool_ops_validated_drafts_only():
    """A real provider's tool-call ops are validated server-side: good entries kept + image
    attached, title-less entries and out-of-range image refs dropped."""
    ops = (
        '[{"op":"create_entries","entries":['
        '{"type":"event","title":"Galway Oyster Festival","city":"Galway City"},'
        '{"description":"no title here"},'  # title-less → dropped by _normalize_entry
        '{"type":"place","title":"Cliffs of Moher","city":"Doolin"}]},'
        '{"op":"attach_image","entry_ref":0,"image_ref":0},'  # valid → attaches image 0 to entry 0
        '{"op":"attach_image","entry_ref":1,"image_ref":7},'  # image_ref out of range → ignored
        '{"op":"attach_image","entry_ref":9,"image_ref":0}]'  # entry_ref out of range → ignored
    )
    fake = _RecordingProvider(responses=[ops])
    entries = plan_entries("some grounded facts", image_count=1, provider=fake)

    assert fake.prompts, "a real provider must be asked to run the tool-call loop"
    assert [e["title"] for e in entries] == ["Galway Oyster Festival", "Cliffs of Moher"]
    assert entries[0]["type"] == CatalogType.event
    assert entries[0][IMAGE_INDEX_KEY] == 0  # the one valid attach_image was applied
    assert entries[1][IMAGE_INDEX_KEY] is None  # its out-of-range ref was dropped


def test_tool_ops_malformed_falls_back_to_heuristic():
    """Malformed/empty model output (or no entries) falls back to the deterministic heuristic."""
    facts = "Galway Oyster Festival\nType: event\nLocation: Galway City"
    fake = _RecordingProvider(responses=["not json {{{"])
    entries = plan_entries(facts, image_count=2, provider=fake)
    assert len(entries) == 1
    assert entries[0]["title"] == "Galway Oyster Festival"
    assert entries[0][IMAGE_INDEX_KEY] == 0  # heuristic attaches image 0 to entry 0 (by order)


def test_tool_ops_stub_deterministic():
    """Stub path (no key): deterministic entries, images attached by order; same inputs ⇒ same."""
    facts = (
        "Galway Oyster Festival\nType: event\nLocation: Galway City\n\n"
        "Cliffs of Moher\nType: place\nLocation: Doolin\n\n"
        "Dingle Peninsula\nType: place\nLocation: Dingle"
    )
    first = plan_entries(facts, image_count=2, provider=StubProvider())
    second = plan_entries(facts, image_count=2, provider=StubProvider())
    assert first == second
    assert len(first) == 3
    # Only the first two entries get an image (image_count=2); the third has none.
    assert [e[IMAGE_INDEX_KEY] for e in first] == [0, 1, None]


# -------------------------------------------------- provider-failure fallback regression (the fix)


def test_provider_failure_falls_back_no_500(client, provider_headers, monkeypatch):
    """A provider whose complete() raises must degrade to the deterministic extractor — never 500.

    Direct: extract_entries with a raising provider equals the stub result (both stages fall back).
    End-to-end: with that provider injected, /import still returns 202 and the job completes."""
    pdf = _pdf("Galway Oyster Festival\nType: event\nLocation: Galway City\nSeafood celebration.")

    raising = extract_entries("doc.pdf", "application/pdf", pdf, _RaisingProvider())
    stubbed = extract_entries("doc.pdf", "application/pdf", pdf, StubProvider())
    assert raising == stubbed
    assert len(raising) >= 1

    # Inject the raising provider into the import path; the job must still finish cleanly.
    monkeypatch.setattr(
        "app.routers.auto_catalog.get_provider", lambda settings: _RaisingProvider()
    )
    res = _import(client, provider_headers, pdf)
    assert res.status_code == 202, res.text
    final = _job(client, provider_headers, res.json()["id"])
    assert final["status"] == "done"
    assert final["drafts_created"] >= 1
