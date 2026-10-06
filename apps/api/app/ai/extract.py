"""Auto-Catalog extraction pipeline (AC64–AC66).

Turns an uploaded document (PDF / PNG / JPEG) into **1..N proposed draft catalog entries** through a
two-stage pass over the AC16 ``AIProvider`` seam, mirroring the Builder agent (``app/ai/builder``).

1. **Extract** — pull the document's text locally first (``pypdf`` for PDFs; images carry no text
   in this PoC), then ask the provider to distil relevant tourism facts from that text. The
   deterministic stub returns the local text unchanged, so the demo and tests need no key/network.
2. **Structure** — ask the provider to map those facts into a JSON array of entries; the response
   is parsed and validated against the real content model (valid ``type``, grounded fields, template
   attributes) like ``builder._parse_ops``. Anything invalid/ungrounded is dropped or left blank —
   never fabricated. When the provider is the stub (or returns nothing usable), a deterministic
   heuristic parses the facts text into entries instead.

Determinism (Contract 4): the same document + stub ⇒ identical proposed entries. Safety (Contracts
2 & 5): this module never logs document text or provider keys — callers log counts only.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.ai.base import AIProvider
from app.content_templates import template_for
from app.geo import GEO
from app.models.catalog import CatalogType, Season

logger = logging.getLogger("app.ai.extract")

PDF_CONTENT_TYPE = "application/pdf"
IMAGE_CONTENT_TYPES = frozenset({"image/png", "image/jpeg"})
SUPPORTED_CONTENT_TYPES = frozenset({PDF_CONTENT_TYPE, *IMAGE_CONTENT_TYPES})

_MAX_ENTRIES = 25  # bound a single document's output (PoC is one synchronous document)
_MAX_TEXT = 20_000  # cap the text handed to the model / heuristic
_MAX_IMAGES = 25  # bound how many embedded images a single document contributes

# Keyword → content type, scanned in priority order so the most specific wins.
_TYPE_KEYWORDS: list[tuple[CatalogType, tuple[str, ...]]] = [
    (CatalogType.itinerary, ("itinerary", "self-drive", "road trip", "day trip", "tour route",
                             "walking route", "driving route")),
    (CatalogType.offer, ("offer", "deal", "discount", "package", "% off", "save ", "special rate")),
    (CatalogType.opportunity, ("opportunity", "partnership", "commission", "fam trip",
                               "familiarisation", "familiarization", "tender", "trade")),
    (CatalogType.event, ("festival", "event", "concert", "parade", "regatta", "fair", "race",
                         "championship", "exhibition", "market day")),
    (CatalogType.place, ("beach", "park", "museum", "castle", "cliffs", "village", "garden",
                         "lake", "mountain", "harbour", "harbor", "island", "trail")),
]

_SEASON_WORDS = {s.value: s for s in Season} | {
    "spring": Season.spring,
    "summer": Season.summer,
    "autumn": Season.autumn,
    "fall": Season.autumn,
    "winter": Season.winter,
    "year round": Season.year_round,
    "all year": Season.year_round,
    "all-year": Season.year_round,
}

_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})\b")
_KV_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9 _/&-]{1,40}?)\s*[:：]\s*(.+?)\s*$")


# --------------------------------------------------------------------------- local text extraction


def extract_text_from_pdf(data: bytes) -> str:
    """Pull text from a PDF locally with ``pypdf``. Returns ``""`` if the library is unavailable or
    the file can't be parsed inertly — never raises, so an un-extractable upload degrades safely.
    """
    try:
        from io import BytesIO

        from pypdf import PdfReader
    except Exception:  # pragma: no cover - pypdf missing from the toolchain
        logger.info("pypdf unavailable; skipping local PDF text extraction")
        return ""
    try:
        reader = PdfReader(BytesIO(data))
        parts = [page.extract_text() or "" for page in reader.pages]
    except Exception:
        logger.info("could not extract text from the uploaded PDF; continuing with empty text")
        return ""
    return "\n".join(p.strip() for p in parts if p.strip()).strip()


# Map a PyMuPDF image ``ext`` to a servable raster content-type; unknown/active types are dropped.
_IMAGE_EXT_TO_TYPE = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "bmp": "image/bmp",
}


def extract_images_from_pdf(data: bytes) -> list[tuple[bytes, str]]:
    """Pull embedded raster images from a PDF with PyMuPDF (AC72) as ``(bytes, content_type)``.

    Deduplicated by xref. Returns ``[]`` if PyMuPDF is unavailable or the file can't be parsed
    inertly — never raises, so a PDF with no usable image degrades cleanly (no cover). Only known
    raster types are returned; anything else (vector/active content) is skipped (parsed inertly).
    """
    try:
        import pymupdf
    except Exception:  # pragma: no cover - pymupdf missing from the toolchain
        logger.info("pymupdf unavailable; skipping PDF image extraction")
        return []
    images: list[tuple[bytes, str]] = []
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
        seen: set[int] = set()
        for page in doc:
            for info in page.get_images(full=True):
                xref = info[0]
                if xref in seen:
                    continue
                seen.add(xref)
                extracted = doc.extract_image(xref)
                content_type = _IMAGE_EXT_TO_TYPE.get((extracted.get("ext") or "").lower())
                payload = extracted.get("image")
                if content_type and payload:
                    images.append((payload, content_type))
                if len(images) >= _MAX_IMAGES:
                    return images
    except Exception:
        logger.info("could not extract images from the uploaded PDF; continuing with none")
        return images
    return images


def document_images(filename: str, content_type: str, data: bytes) -> list[tuple[bytes, str]]:
    """Candidate images for the document (AC72): embedded images for a PDF; for a direct PNG/JPEG
    upload, the file itself is the single candidate. Returns ``(bytes, content_type)`` pairs."""
    if content_type == PDF_CONTENT_TYPE:
        return extract_images_from_pdf(data)
    if content_type in IMAGE_CONTENT_TYPES:
        return [(data, content_type)]
    return []


def document_text(filename: str, content_type: str, data: bytes) -> str:
    """The clean text fed to the model/heuristic: PDF text for PDFs; for images, a filename cue only
    (no OCR in this PoC). Never includes raw bytes."""
    if content_type == PDF_CONTENT_TYPE:
        return extract_text_from_pdf(data)[:_MAX_TEXT]
    # Images: derive a deterministic cue from the filename stem so the stub still yields a draft.
    stem = re.sub(r"\.[A-Za-z0-9]+$", "", filename or "").replace("-", " ").replace("_", " ")
    return stem.strip()[:_MAX_TEXT]


# ------------------------------------------------------------------------------- stage 1 (extract)


def _extract_instruction(text: str) -> str:
    return (
        "You are a tourism catalog assistant. From the document text below, extract the distinct "
        "tourism offerings (events, places, offers, opportunities, itineraries) as plain facts — "
        "one block per offering, each starting with its name on its own line, followed by "
        "'Label: value' lines (Type, Location, Country, City, Season, dates, links) and '- ' "
        "highlight bullets. Use ONLY information in the text; never invent facts.\n\nDOCUMENT:\n"
        + text
    )


def _extract_facts(text: str, provider: AIProvider) -> str:
    """Stage 1: ask the provider to distil facts from the locally-extracted text. The stub, an empty
    response, or a provider failure (timeout/network/HTTP) falls back to the local text, which is
    already grounded + deterministic — a flaky provider must never 500 the import (AC70)."""
    if provider.name != "stub" and text.strip():
        try:
            completion = provider.complete(_extract_instruction(text), max_tokens=1500)
        except Exception:  # noqa: BLE001 - any provider error degrades to the local text
            logger.info("stage-1 provider call failed; falling back to local text")
            return text
        distilled = (completion.text or "").strip()
        if distilled:
            return distilled[:_MAX_TEXT]
    return text


# ----------------------------------------------------------------------------- stage 2 (structure)


def _structure_instruction(facts: str) -> str:
    types = ", ".join(t.value for t in CatalogType)
    return (
        "Convert the tourism facts below into a JSON array of catalog entries. Each entry is an "
        f'object with keys: "type" (one of: {types}), "title", "description", "destination", '
        '"country", "state", "city", "season" (spring/summer/autumn/winter/year_round), '
        '"attributes" (object of the type\'s template fields), "highlights" (array of strings), '
        '"market_tags" (array of strings). Fill only fields grounded in the facts; omit the rest. '
        "Reply with the JSON array only.\n\nFACTS:\n" + facts
    )


def _structure_entries(facts: str, provider: AIProvider) -> list[dict[str, Any]]:
    """Stage 2: map facts → normalized entry dicts. Real providers go via the model + JSON parse;
    the stub, an unusable response, or a provider failure (timeout/network/HTTP) uses the
    deterministic heuristic over the same facts text — a flaky provider must never 500 (AC70)."""
    if provider.name != "stub" and facts.strip():
        try:
            completion = provider.complete(_structure_instruction(facts), max_tokens=2048)
        except Exception:  # noqa: BLE001 - any provider error degrades to the heuristic
            logger.info("stage-2 provider call failed; falling back to heuristic")
            return _heuristic_entries(facts)
        parsed = _parse_entries(completion.text)
        if parsed:
            return parsed
    return _heuristic_entries(facts)


def _parse_entries(text: str) -> list[dict[str, Any]]:
    """Validate a model's JSON array of entries into normalized dicts; ``[]`` if nothing usable."""
    try:
        raw = json.loads(text)
    except (ValueError, TypeError):
        return []
    if isinstance(raw, dict):
        raw = raw.get("entries", raw.get("items"))
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        entry = _normalize_entry(item)
        if entry is not None:
            out.append(entry)
        if len(out) >= _MAX_ENTRIES:
            break
    return out


# -------------------------------------------------------------------------- deterministic heuristic


def _blocks(text: str) -> list[str]:
    """Split the facts text into offering blocks on blank lines (deterministic)."""
    chunks = re.split(r"\n\s*\n", text.strip())
    return [c.strip() for c in chunks if c.strip()]


def _match_type(text: str) -> CatalogType:
    low = text.lower()
    for type_, words in _TYPE_KEYWORDS:
        if any(w in low for w in words):
            return type_
    return CatalogType.place  # a required, non-null field; place is the neutral default


def _gazetteer(text: str) -> dict[str, str]:
    """Match the first known city (then its state/country) from the curated GEO (AC53)."""
    low = text.lower()
    for country, states in GEO.items():
        for state, cities in states.items():
            for city in cities:
                if city.lower() in low:
                    return {"country": country, "state": state, "city": city}
    for country, states in GEO.items():
        for state in states:
            if state.lower() in low:
                return {"country": country, "state": state, "city": ""}
    for country in GEO:
        if country.lower() in low:
            return {"country": country, "state": "", "city": ""}
    return {}


def _heuristic_entries(facts: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for block in _blocks(facts):
        entry = _parse_block(block)
        if entry is not None:
            out.append(entry)
        if len(out) >= _MAX_ENTRIES:
            break
    return out


def _parse_block(block: str) -> dict[str, Any] | None:
    lines = [ln.rstrip() for ln in block.splitlines()]
    title = ""
    kv: dict[str, str] = {}
    highlights: list[str] = []
    prose: list[str] = []
    for ln in lines:
        stripped = ln.strip()
        if not stripped:
            continue
        if stripped.startswith(("- ", "* ", "• ")):
            highlights.append(stripped[2:].strip())
            continue
        m = _KV_RE.match(stripped)
        if m:
            kv[m.group(1).strip().lower()] = m.group(2).strip()
            continue
        if not title:
            title = stripped.rstrip(":")
            continue
        prose.append(stripped)
    if not title:
        return None  # ungrounded block (no name) is dropped, never fabricated

    type_ = _coerce_type(kv.get("type")) or _match_type(block)
    raw: dict[str, Any] = {
        "type": type_.value,
        "title": title,
        "description": " ".join(prose),
        "highlights": highlights,
    }
    loc = {k: kv[k] for k in ("country", "state", "city") if kv.get(k)}
    if not loc:
        loc = _gazetteer(block)
    raw.update(loc)
    destination = kv.get("destination") or kv.get("location") or ", ".join(
        v for v in (loc.get("city"), loc.get("state"), loc.get("country")) if v
    )
    if destination:
        raw["destination"] = destination
    if kv.get("season"):
        raw["season"] = kv["season"]
    tags = kv.get("tags") or kv.get("markets") or kv.get("market_tags")
    if tags:
        raw["market_tags"] = [t.strip() for t in tags.split(",") if t.strip()]
    # Per-type template attributes, grounded in the block's Label: value lines only.
    attributes: dict[str, Any] = {}
    for field in template_for(type_):
        key, label = field["key"], field["label"].lower()
        value = kv.get(key) or kv.get(label) or kv.get(label.replace(" ", "_"))
        if value:
            attributes[key] = value
    raw["attributes"] = attributes
    return _normalize_entry(raw)


# -------------------------------------------------------------------------------- normalization


def _coerce_type(value: Any) -> CatalogType | None:
    if isinstance(value, str):
        try:
            return CatalogType(value.strip().lower())
        except ValueError:
            return None
    return None


def _coerce_season(value: Any) -> Season | None:
    if not isinstance(value, str):
        return None
    key = value.strip().lower()
    return _SEASON_WORDS.get(key)


def _coerce_attributes(type_: CatalogType, value: Any) -> dict[str, str]:
    """Keep only valid template fields with grounded values; coerce by field type, drop the rest."""
    if not isinstance(value, dict):
        return {}
    by_key = {f["key"]: f for f in template_for(type_)}
    out: dict[str, str] = {}
    for key, field in by_key.items():
        if key not in value or value[key] in (None, ""):
            continue
        raw = str(value[key]).strip()
        ftype = field.get("type", "text")
        if ftype == "number":
            if not re.fullmatch(r"-?\d+(\.\d+)?", raw):
                continue
        elif ftype == "url":
            if "://" not in raw and not raw.lower().startswith("www."):
                continue
        elif ftype == "date":
            if not _DATE_RE.search(raw):
                continue
        out[key] = raw[:500]
    return out


def _str_list(value: Any, *, cap: int = 24) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(v).strip()[:160] for v in value if str(v).strip()][:cap]


def _normalize_entry(data: dict[str, Any]) -> dict[str, Any] | None:
    """Finalize one raw entry into a safe, grounded dict — or ``None`` to drop it (no title)."""
    title = str(data.get("title", "")).strip()[:300]
    if not title:
        return None
    type_ = _coerce_type(data.get("type")) or CatalogType.place
    return {
        "type": type_,
        "title": title,
        "description": str(data.get("description", "")).strip()[:4000],
        "destination": str(data.get("destination", "")).strip()[:200],
        "country": str(data.get("country", "")).strip()[:120],
        "state": str(data.get("state", "")).strip()[:120],
        "city": str(data.get("city", "")).strip()[:120],
        "season": _coerce_season(data.get("season")),
        "attributes": _coerce_attributes(type_, data.get("attributes")),
        "highlights": _str_list(data.get("highlights")),
        "market_tags": _str_list(data.get("market_tags")),
    }


# --------------------------------------------------------------------------------------- public API


def extract_entries(
    filename: str, content_type: str, data: bytes, provider: AIProvider
) -> list[dict[str, Any]]:
    """Run the two-stage pipeline and return normalized draft-entry dicts (0..N, bounded).

    The returned dicts carry only derived content fields (``type``/``title``/location/``season``/
    ``attributes``/``highlights``/``market_tags``); the caller supplies ownership, catalog + draft
    status. Logs counts only — never document text or keys (Contracts 2 & 5)."""
    text = document_text(filename, content_type, data)
    facts = _extract_facts(text, provider)
    entries = _structure_entries(facts, provider)
    logger.info(
        "auto-catalog extraction: provider=%s pdf_chars=%d entries=%d",
        provider.name,
        len(text),
        len(entries),
    )
    return entries
