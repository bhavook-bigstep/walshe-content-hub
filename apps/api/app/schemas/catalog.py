from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.catalog import CatalogType, EntryStatus


class EntryCreate(BaseModel):
    type: CatalogType
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    destination: str = Field(min_length=1, max_length=200)
    market_tags: list[str] = Field(default_factory=list)


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

    model_config = {"from_attributes": True}
