"""Request/response schemas for AI copy generation (Generate caption / Generate keywords)."""

from __future__ import annotations

from pydantic import BaseModel


class AiCopyRequest(BaseModel):
    """Both endpoints act on one of the caller's saved compositions."""

    composition_id: int


class CaptionOut(BaseModel):
    caption: str


class KeywordsOut(BaseModel):
    hashtags: list[str]
