from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel, Field, model_validator

from app.lifecycle import display_status
from app.models.catalog import (
    CatalogType,
    CatalogVisibility,
    DisplayStatus,
    EntryStatus,
    EntryVisibility,
    ItemKind,
    Season,
    UserAssetSource,
)

if TYPE_CHECKING:
    from app.models.catalog import Catalog, CatalogEntry


class ItemOut(BaseModel):
    """A first-class entry item (AC50) — one text block or one media file."""

    id: int
    entry_id: int
    kind: ItemKind
    order: int = 0
    title: str = ""
    text: str = ""
    object_key: str = ""
    content_type: str = ""
    alt: str = ""

    model_config = {"from_attributes": True}


class TextItemCreate(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    title: str = Field(default="", max_length=300)
    order: int = 0


class UserAssetOut(BaseModel):
    """A user's own stored asset (AC51) — uploaded (``local``) or generated (``agent``)."""

    id: int
    source: UserAssetSource
    kind: ItemKind
    title: str = ""
    text: str = ""
    object_key: str = ""
    content_type: str = ""

    model_config = {"from_attributes": True}


class GenerateRequest(BaseModel):
    """Ask the AI layer to generate an image + text into the user's Agent storage (AC51)."""

    prompt: str = Field(min_length=1, max_length=500)


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


class AgentInvite(BaseModel):
    """Invite an agent to a catalog's private entries by email (AC54)."""

    email: str = Field(min_length=3, max_length=320)


class AgentRef(BaseModel):
    """An invited agent, resolved for display (AC54)."""

    id: int
    email: str
    display_name: str = ""


class CatalogOut(BaseModel):
    id: int
    provider_id: int
    name: str
    category: str
    visibility: CatalogVisibility
    shared_agent_ids: list[int] = []
    # Resolved invited agents (id + email), populated on the provider's own catalog responses.
    invited_agents: list[AgentRef] = []
    entry_count: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def from_catalog(
        cls, catalog: "Catalog", *, invited_agents: list[AgentRef] | None = None
    ) -> "CatalogOut":
        return cls(
            id=catalog.id,
            provider_id=catalog.provider_id,
            name=catalog.name,
            category=catalog.category,
            visibility=catalog.visibility,
            shared_agent_ids=list(catalog.shared_agent_ids or []),
            invited_agents=invited_agents or [],
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
    # Structured location (AC53) — drives the agent catalog filters; destination stays the label.
    country: str = Field(default="", max_length=120)
    state: str = Field(default="", max_length=120)
    city: str = Field(default="", max_length=120)
    season: Season | None = None
    # Per-entry distribution (AC54): defaults to draft; the provider chooses public/private.
    visibility: EntryVisibility = EntryVisibility.draft
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

    type: CatalogType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    destination: str | None = Field(default=None, min_length=1, max_length=200)
    country: str | None = Field(default=None, max_length=120)
    state: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    season: Season | None = None
    market_tags: list[str] | None = None
    attributes: dict | None = None
    highlights: list[str] | None = None
    custom_sections: list[CustomSection] | None = None


class AccessUpdate(BaseModel):
    brand_safe: bool | None = None
    status: EntryStatus | None = None
    # Per-entry distribution set (AC54): draft / public / private.
    visibility: EntryVisibility | None = None
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
    country: str = ""
    state: str = ""
    city: str = ""
    season: Season | None = None
    visibility: EntryVisibility = EntryVisibility.draft
    # Provenance (AC56): who created the entry + which org it belongs to ("" when none).
    created_by_email: str = ""
    org_name: str = ""
    market_tags: list[str]
    status: EntryStatus
    brand_safe: bool
    # AI-created marker (AC68): True when generated by the Auto-Catalog agent (AC64–AC67).
    ai_created: bool = False
    provider_id: int
    attributes: dict = {}
    highlights: list[str] = []
    custom_sections: list[CustomSection] = []
    # Cover photo (AC52): the entry's card image object key, or "" to fall back in the UI.
    cover_object_key: str = ""
    asset_keys: list[str] = []
    items: list[ItemOut] = []
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
            country=entry.country,
            state=entry.state,
            city=entry.city,
            season=entry.season,
            visibility=entry.visibility,
            created_by_email=entry.created_by_email,
            org_name=entry.org_name,
            market_tags=entry.market_tags,
            status=entry.status,
            brand_safe=entry.brand_safe,
            ai_created=entry.ai_created,
            provider_id=entry.provider_id,
            attributes=entry.attributes,
            highlights=entry.highlights,
            custom_sections=entry.custom_sections,
            cover_object_key=entry.cover_object_key,
            asset_keys=entry.asset_keys,
            items=[ItemOut.model_validate(i) for i in entry.items],
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


class GeoState(BaseModel):
    name: str
    cities: list[str]


class GeoCountry(BaseModel):
    name: str
    states: list[GeoState]


class SeasonOption(BaseModel):
    value: str
    label: str


class GeoData(BaseModel):
    """Curated location hierarchy + the fixed season list for the catalog forms + filters (AC53)."""

    countries: list[GeoCountry]
    seasons: list[SeasonOption]


class AutoCatalogResult(BaseModel):
    """Result of an Auto-Catalog import (AC64–AC67): draft entries generated from one document."""

    count: int
    entries: list[EntryOut]
