"""Campaign request/response models (design §3, §7)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from pydantic import BaseModel, Field, field_serializer, model_validator

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

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime) -> str:
        # Same UTC-marking as scheduled_at: SQLite drops tzinfo, so stamp UTC on output so clients
        # never read a stored-UTC timestamp as local time.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()


class CampaignPostOut(BaseModel):
    id: int
    campaign_id: int | None
    composition_id: int
    platform: str
    caption: str
    status: PostStatus
    scheduled_at: datetime | None
    media_object_key: str | None
    # Approval gate (AC66) + publish receipt (AC67).
    approved_by: int | None = None
    reviewed_at: datetime | None = None
    review_note: str = ""
    external_id: str | None = None
    permalink: str | None = None
    model_config = {"from_attributes": True}

    @field_serializer("reviewed_at")
    def _serialize_reviewed_at(self, value: datetime | None) -> str | None:
        # Same UTC-marking as scheduled_at: SQLite drops tzinfo on read-back.
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()

    @field_serializer("scheduled_at")
    def _serialize_scheduled_at(self, value: datetime | None) -> str | None:
        # scheduled_at is always stored in UTC, but SQLite drops tzinfo so it reads back naive.
        # Emit an explicit UTC offset so clients (the browser calendar) never read it as local time.
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()


class CampaignDetailOut(CampaignOut):
    posts: list[CampaignPostOut] = Field(default_factory=list)
