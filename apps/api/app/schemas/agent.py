"""Agent workspace schemas (AC28): saved projects, collections, brand kit, templates."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: str = "social"
    item_ids: list[int] = Field(default_factory=list)
    design: dict = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    format: str | None = None
    item_ids: list[int] | None = None
    design: dict | None = None


class ProjectOut(BaseModel):
    id: int
    name: str
    format: str
    item_ids: list[int]
    design: dict

    model_config = {"from_attributes": True}


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    item_ids: list[int] = Field(default_factory=list)


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    item_ids: list[int] | None = None


class CollectionOut(BaseModel):
    id: int
    name: str
    item_ids: list[int]

    model_config = {"from_attributes": True}


class BrandKitUpdate(BaseModel):
    logo_url: str | None = Field(default=None, max_length=512)
    primary_color: str | None = Field(default=None, max_length=9)
    accent_color: str | None = Field(default=None, max_length=9)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: str | None = Field(default=None, max_length=320)
    website: str | None = Field(default=None, max_length=512)


class BrandKitOut(BaseModel):
    logo_url: str | None
    primary_color: str
    accent_color: str
    contact_name: str | None
    contact_email: str | None
    website: str | None

    model_config = {"from_attributes": True}


class DesignTemplate(BaseModel):
    id: str
    name: str
    format: str
    description: str
