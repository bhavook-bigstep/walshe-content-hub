from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, model_validator

from app.lifecycle import display_status
from app.models.catalog import CatalogType, CatalogVisibility, DisplayStatus, EntryStatus

if TYPE_CHECKING:
    from app.models.catalog import Catalog, CatalogEntry


class CatalogCreate(BaseModel):
    """Provider creates a catalog (AC49)."""

    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=120)
    visibility: CatalogVisibility = CatalogVisibility.private


class CatalogUpdate(BaseModel):
    """Rename / re-categorise / re-publish a catalog (AC49). Only provided fields change."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=120)
    visibility: CatalogVisibility | None = None


class CatalogShareUpdate(BaseModel):
    """Set the agent ids a private catalog is shared with (AC49)."""

    shared_agent_ids: list[int] = Field(default_factory=list)


class CatalogOut(BaseModel):
    id: int
    provider_id: int
    name: str
    category: str
    visibility: CatalogVisibility
    shared_agent_ids: list[int] = []
    entry_count: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def from_catalog(cls, catalog: "Catalog") -> "CatalogOut":
        return cls(
            id=catalog.id,
            provider_id=catalog.provider_id,
            name=catalog.name,
            category=catalog.category,
            visibility=catalog.visibility,
            shared_agent_ids=list(catalog.shared_agent_ids or []),
            entry_count=len(catalog.entries),
        )


def _check_validity_window(valid_from: datetime | None, expires_at: datetime | None) -> None:
    """Reject an inverted validity window at the boundary (security.md: validate at the edge)."""
    if valid_from is not None and expires_at is not None and valid_from >= expires_at:
        raise ValueError("valid_from must be before expires_at")


class CustomSection(BaseModel):
    """A titled rich block for content that doesn't fit the type's template (AC29)."""

    title: str = Field(min_length=1, max_length=160)
    body: str = Field(default="", max_length=4000)


class EntryCreate(BaseModel):
    # The catalog this entry belongs to (AC49). Optional during migration; when given it must be
    # one of the provider's own catalogs.
    catalog_id: int | None = None
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


class SendBackRequest(BaseModel):
    """Reviewer returns an entry to its owner with a reason (AC35 / FR-14)."""

    reason: str = Field(min_length=1, max_length=1000)


class EntryOut(BaseModel):
    id: int
    catalog_id: int | None = None
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
    review_reason: str = (
        ""  # reviewer's send-back reason, shown while the item sits in draft (AC35)
    )

    model_config = {"from_attributes": True}

    @classmethod
    def from_entry(cls, entry: "CatalogEntry", *, now: datetime) -> "EntryOut":
        """Serialise an entry, deriving ``display_status`` from its validity window + clock."""
        return cls(
            id=entry.id,
            catalog_id=entry.catalog_id,
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
            review_reason=entry.review_reason,
        )


class TemplateField(BaseModel):
    key: str
    label: str
    type: str
    help: str = ""


class ContentTemplates(BaseModel):
    """Self-describing schema of the structured fields per content type (AC29)."""

    templates: dict[str, list[TemplateField]]
