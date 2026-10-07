"""Response schema for the Instagram publish endpoint."""

from __future__ import annotations

from pydantic import BaseModel


class InstagramPublishOut(BaseModel):
    post_id: int
    external_id: str | None
    permalink: str | None
    status: str
