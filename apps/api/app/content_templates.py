"""Structured content templates (AC29).

Each tourism content type declares the typed fields it expects. This is the single source of truth
for (a) the provider's structured-entry form and (b) an explicit, self-describing schema that AI
agents crawling the inventory can rely on. Anything outside a template is captured as a custom
section on the entry, so the inventory stays rich *and* structured.
"""

from __future__ import annotations

from app.models.catalog import CatalogType

# Field types the UI + crawlers understand.
FieldType = str  # "text" | "textarea" | "number" | "date" | "url"


def _f(key: str, label: str, type_: FieldType, *, help_: str = "") -> dict[str, str]:
    return {"key": key, "label": label, "type": type_, "help": help_}


CONTENT_TEMPLATES: dict[str, list[dict[str, str]]] = {
    CatalogType.event.value: [
        _f("start_date", "Start date", "date"),
        _f("end_date", "End date", "date"),
        _f("venue", "Venue", "text"),
        _f("ticket_url", "Ticket link", "url"),
        _f("expected_attendance", "Expected attendance", "number"),
    ],
    CatalogType.place.value: [
        _f("region", "Region", "text"),
        _f("best_season", "Best season", "text", help_="e.g. Spring, Summer"),
        _f("latitude", "Latitude", "number"),
        _f("longitude", "Longitude", "number"),
        _f("accessibility", "Accessibility notes", "textarea"),
    ],
    CatalogType.opportunity.value: [
        _f("deadline", "Deadline", "date"),
        _f("commission", "Commission / rate", "text"),
        _f("partner", "Partner", "text"),
        _f("terms_url", "Terms link", "url"),
    ],
    CatalogType.offer.value: [
        _f("price_from", "Price from", "number"),
        _f("currency", "Currency", "text", help_="e.g. EUR, AUD"),
        _f("valid_until", "Valid until", "date"),
        _f("booking_url", "Booking link", "url"),
    ],
    CatalogType.itinerary.value: [
        _f("duration_days", "Duration (days)", "number"),
        _f("stops", "Stops", "text", help_="comma-separated"),
        _f("difficulty", "Difficulty", "text"),
        _f("map_url", "Map link", "url"),
    ],
}


def template_for(type_: CatalogType) -> list[dict[str, str]]:
    return CONTENT_TEMPLATES.get(type_.value, [])
