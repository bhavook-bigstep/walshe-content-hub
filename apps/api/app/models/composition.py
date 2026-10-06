"""Agent composition model (AC7) — selected catalog items + chosen format."""

from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.models.base import Base


class Composition(Base):
    __tablename__ = "compositions"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    format: Mapped[str] = mapped_column(String(50), default="social")
    item_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    # Saved projects (AC28): a name + the Studio canvas design so it can be reopened.
    name: Mapped[str] = mapped_column(String(200), default="")
    design: Mapped[dict] = mapped_column(JSON, default=dict)
    # Per-item captured master version at save time (AC33): {str(entry_id): content_version}.
    # A later master edit bumps the entry's content_version, so a mismatch flags the in-use copy.
    item_versions: Mapped[dict] = mapped_column(JSON, default=dict)
    # AC64 — the structured Workspace: {metadata, reference_content:{collections,uploads,generated},
    # scenes}. One object the studio autosaves and the builder-mode agent reads. `item_ids`/`design`
    # stay as a derived/compat view; an old project with no workspace is migrated on read.
    workspace: Mapped[dict] = mapped_column(JSON, default=dict)
