from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.catalog import CatalogType, EntryStatus


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

    model_config = {"from_attributes": True}


class TemplateField(BaseModel):
    key: str
    label: str
    type: str
    help: str = ""


class ContentTemplates(BaseModel):
    """Self-describing schema of the structured fields per content type (AC29)."""

    templates: dict[str, list[TemplateField]]
