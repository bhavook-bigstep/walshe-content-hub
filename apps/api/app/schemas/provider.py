"""Provider workspace schemas (AC29): media library, team, performance."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MediaItem(BaseModel):
    object_key: str
    content_type: str
    entry_id: int
    entry_title: str


class TeamMember(BaseModel):
    id: int
    email: str
    display_name: str | None
    approved: bool


class TeamInvite(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=200)
    display_name: str | None = Field(default=None, max_length=120)


class PerformanceRow(BaseModel):
    entry_id: int
    title: str
    uses: int
    reach: int


class PerformanceOut(BaseModel):
    total_uses: int
    total_reach: int
    rows: list[PerformanceRow]
