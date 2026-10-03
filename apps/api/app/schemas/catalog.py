from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, model_validator

from app.lifecycle import display_status
from app.models.catalog import CatalogType, DisplayStatus, EntryStatus

if TYPE_CHECKING:
    from app.models.catalog import CatalogEntry


def _check_validity_window(valid_from: datetime | None, expires_at: datetime | None) -> None:
    """Reject an inverted validity window at the boundary (security.md: validate at the edge)."""
    if valid_from is not None and expires_at is not None and valid_from >= expires_at:
        raise ValueError("valid_from must be before expires_at")


class CustomSection(BaseModel):
    """A titled rich block for content that doesn't fit the type's template (AC29)."""

    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default="", max_length=4000)


class EntryCreate(BaseModel):
    type: CatalogType
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    destination: str = Field(min_length=1, max_length=200)
    market_tags: list[str] = Field(default_factory=list)
    # Structured inventory (AC29).
    attributes: dict = Field(default_factory=dict)
    highlights: list[str] = Field(default_factory=list)
    custom_sections: list[CustomSection] = Field(default_factory=list)
    # Validity window (AC32) — optional; both nullable.
    valid_from: datetime | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def _validity_ordered(self) -> "EntryCreate":
        _check_validity_window(self.valid_from, self.expires_at)
        return self


class EntryContentUpdate(BaseModel):
    """Provider-owned content edit (AC29). All fields optional; only provided ones change."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    destination: str | None = Field(default=None, min_length=1, max_length=200)
    market_tags: list[str] | None = None
    attributes: dict | None = None
    highlights: list[str] | None = None
    custom_sections: list[CustomSection] | None = None


class AccessUpdate(BaseModel):
    brand_safe: bool | None = None
    status: EntryStatus | None = None
    allowed_tenant_ids: list[int] | None = None
    allowed_agent_ids: list[int] | None = None
    # Provider may set/adjust the validity window via the existing PATCH (AC32).
    valid_from: datetime | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def _validity_ordered(self) -> "AccessUpdate":
        _check_validity_window(self.valid_from, self.expires_at)
        return self


class EntryOut(BaseModel):
    id: int
    type: CatalogType
    title: str
    description: str
    destination: str
    market_tags: list[str]
    status: EntryStatus
    brand_safe: bool
    provider_id: int
    attributes: dict = {}
    highlights: list[str] = []
    custom_sections: list[CustomSection] = []
    asset_keys: list[str] = []
    # Validity + derived display status serialise on every item, for every role (AC32).
    valid_from: datetime | None = None
    expires_at: datetime | None = None
    display_status: DisplayStatus

    model_config = {"from_attributes": True}

    @classmethod
    def from_entry(cls, entry: "CatalogEntry", *, now: datetime) -> "EntryOut":
        """Serialise an entry, deriving ``display_status`` from its validity window + clock."""
        return cls(
            id=entry.id,
            type=entry.type,
            title=entry.title,
            description=entry.description,
            destination=entry.destination,
            market_tags=entry.market_tags,
            status=entry.status,
            brand_safe=entry.brand_safe,
            provider_id=entry.provider_id,
            attributes=entry.attributes,
            highlights=entry.highlights,
            custom_sections=entry.custom_sections,
            asset_keys=entry.asset_keys,
            valid_from=entry.valid_from,
            expires_at=entry.expires_at,
            display_status=display_status(entry.status, entry.expires_at, now),
        )


class TemplateField(BaseModel):
    key: str
    label: str
    type: str
    help: str = ""


class ContentTemplates(BaseModel):
    """Self-describing schema of the structured fields per content type (AC29)."""

    templates: dict[str, list[TemplateField]]
