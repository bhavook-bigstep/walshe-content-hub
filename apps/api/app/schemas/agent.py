"""Agent workspace schemas (AC28): saved projects, collections, brand kit, templates."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.catalog import EntryOut


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    format: str = "social"
    item_ids: list[int] = Field(default_factory=list)
    design: dict = Field(default_factory=dict)
    # AC64 — seed the workspace's reference_content from this collection (optional).
    collection_id: int | None = None


# ---- AC64: structured Workspace (metadata + reference_content + scenes) ----


class EntryRef(BaseModel):
    """A reference to a catalog entry inside a workspace (no media copy)."""

    entry_id: int
    title: str = ""
    type: str = ""


class WorkspaceCollection(BaseModel):
    collection_id: int
    name: str = ""
    entries: list[EntryRef] = Field(default_factory=list)


class AssetRef(BaseModel):
    """A reference to one of the agent's own assets (upload or AI-generated)."""

    asset_id: int
    object_key: str = ""
    kind: str = "image"
    content_type: str = ""
    title: str = ""
    source: str = "local"


class ReferenceContent(BaseModel):
    collections: list[WorkspaceCollection] = Field(default_factory=list)
    uploads: list[AssetRef] = Field(default_factory=list)
    generated: list[AssetRef] = Field(default_factory=list)


class WorkspaceMetadata(BaseModel):
    name: str = ""
    format: str = "social"
    width: int = 1080
    height: int = 1080
    version: int = 1


class WorkspaceIn(BaseModel):
    """Autosave body: the whole workspace. ``reference_content`` holds references only."""

    metadata: WorkspaceMetadata = Field(default_factory=WorkspaceMetadata)
    reference_content: ReferenceContent = Field(default_factory=ReferenceContent)
    scenes: list[dict] = Field(default_factory=list)


class ResolvedCollection(BaseModel):
    collection_id: int
    name: str = ""
    entries: list[EntryOut] = Field(default_factory=list)


class ResolvedReferenceContent(BaseModel):
    collections: list[ResolvedCollection] = Field(default_factory=list)
    uploads: list[AssetRef] = Field(default_factory=list)
    generated: list[AssetRef] = Field(default_factory=list)


class WorkspaceResolved(BaseModel):
    """What the studio loads: references expanded to live entries (with items) + assets."""

    metadata: WorkspaceMetadata
    reference_content: ResolvedReferenceContent
    scenes: list[dict] = Field(default_factory=list)


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
    # Captured master version per item at save time (AC33); keyed by str(entry_id).
    item_versions: dict = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class ProjectResolved(BaseModel):
    """A saved project resolved against the live catalog at read time (AC33).

    ``items`` holds only the items still visible (approved, brand-safe, unexpired, in scope);
    ``dropped_item_ids`` are those auto-withdrawn (expired/withdrawn/removed); ``flagged_item_ids``
    are in-use copies whose master was edited since the project captured them.
    """

    items: list[EntryOut]
    dropped_item_ids: list[int]
    flagged_item_ids: list[int]


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


class CollectionItemAdd(BaseModel):
    """Save an entry reference into a collection (AC59)."""

    entry_id: int


class CollectionResolved(BaseModel):
    """A collection resolved against the live catalog (AC60): current, visible entries only.

    ``dropped_item_ids`` are stored references no longer visible to the agent (expired/withdrawn/
    deleted/out-of-scope) — the UI greys/omits them and the count reflects ``items``.
    """

    id: int
    name: str
    items: list[EntryOut]
    dropped_item_ids: list[int]


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
