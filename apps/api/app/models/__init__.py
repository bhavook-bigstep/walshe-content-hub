"""Importing this package registers every ORM model on ``Base.metadata``."""

from __future__ import annotations

from app.models.agent_features import BrandKit, Collection
from app.models.audit import AuditLog
from app.models.base import Base
from app.models.catalog import Asset, CatalogEntry, CatalogType, DisplayStatus, EntryStatus
from app.models.composition import Composition
from app.models.engagement import Engagement
from app.models.post import Post, PostStatus
from app.models.user import Role, Tenant, User

__all__ = [
    "Base",
    "User",
    "Tenant",
    "Role",
    "CatalogEntry",
    "CatalogType",
    "EntryStatus",
    "DisplayStatus",
    "Asset",
    "Composition",
    "AuditLog",
    "Post",
    "PostStatus",
    "Engagement",
    "Collection",
    "BrandKit",
]
