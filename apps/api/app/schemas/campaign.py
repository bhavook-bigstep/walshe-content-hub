"""Campaign request/response models (design §3, §7)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.models.post import PostStatus


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    destination: str | None = Field(default=None, max_length=120)
    starts_on: date
    ends_on: date

    @model_validator(mode="after")
    def _window_ordered(self) -> "CampaignCreate":
        if self.ends_on < self.starts_on:
            raise ValueError("ends_on must be on or after starts_on")
        return self


class CampaignOut(BaseModel):
    id: int
    name: str
    destination: str | None
    starts_on: date
    ends_on: date
    status: str
    created_at: datetime
    post_count: int = 0
    model_config = {"from_attributes": True}


class CampaignPostOut(BaseModel):
    id: int
    campaign_id: int | None
    composition_id: int
    platform: str
    caption: str
    status: PostStatus
    scheduled_at: datetime | None
    media_object_key: str | None
    model_config = {"from_attributes": True}


class CampaignDetailOut(CampaignOut):
    posts: list[CampaignPostOut] = Field(default_factory=list)
