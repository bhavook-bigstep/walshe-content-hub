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
