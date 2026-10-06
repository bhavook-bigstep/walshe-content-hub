"""Agent workspace endpoints (AC28): saved projects, collections, brand kit, design templates.

All agent-owned and scoped to the signed-in agent.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.deps import get_db, require_role
from app.models.agent_features import BrandKit, Collection
from app.models.catalog import CatalogEntry, UserAsset
from app.models.composition import Composition
from app.models.user import Role, User
from app.schemas.agent import (
    AssetRef,
    BrandKitOut,
    BrandKitUpdate,
    CollectionCreate,
    CollectionItemAdd,
    CollectionOut,
    CollectionResolved,
    CollectionUpdate,
    DesignTemplate,
    ProjectCreate,
    ProjectOut,
    ProjectResolved,
    ProjectUpdate,
    ResolvedCollection,
    ResolvedReferenceContent,
    WorkspaceIn,
    WorkspaceMetadata,
    WorkspaceResolved,
)
from app.schemas.catalog import EntryOut
from app.services.visibility import agent_visible_entries_by_ids

router = APIRouter(prefix="/me", tags=["agent"])

_agent_only = require_role(Role.tourism_agent)

# Starter templates (AC28) — presets an agent can start a design from.
_TEMPLATES: list[DesignTemplate] = [
    DesignTemplate(
        id="social-hero",
        name="Social hero",
        format="social",
        description="A bold 1:1 post with one hero image and a headline.",
    ),
    DesignTemplate(
        id="story-promo",
        name="Story promo",
        format="story",
        description="A 9:16 story with an offer badge and CTA.",
    ),
    DesignTemplate(
        id="pamphlet",
        name="Trade pamphlet",
        format="pamphlet",
        description="A printable A5 pamphlet with three highlights.",
    ),
    DesignTemplate(
        id="carousel",
        name="Destination carousel",
        format="social",
        description="A multi-image set introducing a destination.",
    ),
]


# ------------------------------------------------------------------ saved projects
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> list[Composition]:
    return list(
        db.execute(
            select(Composition)
            .where(Composition.agent_id == agent.id)
            .order_by(Composition.id.desc())
        )
        .scalars()
        .all()
    )


def _snapshot_item_versions(db: Session, item_ids: list[int]) -> dict[str, int]:
    """Capture each resolvable entry's current ``content_version`` (AC33), keyed by str(id)."""
    snapshot: dict[str, int] = {}
    for entry_id in item_ids:
        entry = db.get(CatalogEntry, entry_id)
        if entry is not None:
            snapshot[str(entry_id)] = entry.content_version
    return snapshot


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> Composition:
    # AC64 — seed the structured workspace (from a collection, or the posted item_ids).
    workspace = _seed_workspace(
        db, agent, name=body.name, fmt=body.format, design=body.design,
        collection_id=body.collection_id, item_ids=body.item_ids, now=now,
    )
    item_ids = _ids_from_ws(workspace)
    project = Composition(
        agent_id=agent.id,
        name=body.name,
        format=body.format,
        item_ids=item_ids,
        design=body.design,
        item_versions=_snapshot_item_versions(db, item_ids),
        workspace=workspace,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _owned_project(db: Session, project_id: int, agent: User) -> Composition:
    project = db.get(Composition, project_id)
    if project is None or project.agent_id != agent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> Composition:
    return _owned_project(db, project_id, agent)


@router.get("/projects/{project_id}/resolved", response_model=ProjectResolved)
def resolve_project(
    project_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> ProjectResolved:
    """Resolve a saved project against the live catalog (AC33): expired/withdrawn items drop on
    their own and master-edited items are flagged, with no mutation of the stored project."""
    project = _owned_project(db, project_id, agent)
    visible = agent_visible_entries_by_ids(db, agent, project.item_ids, now=now)
    visible_ids = {e.id for e in visible}
    dropped = [i for i in project.item_ids if i not in visible_ids]
    flagged = [
        e.id
        for e in visible
        if project.item_versions.get(str(e.id)) not in (None, e.content_version)
    ]
    return ProjectResolved(
        items=[EntryOut.from_entry(e, now=now) for e in visible],
        dropped_item_ids=dropped,
        flagged_item_ids=flagged,
    )


# ---- AC64: structured Workspace ---------------------------------------------------------------

_FORMAT_DIMS = {"social": (1080, 1080), "story": (1080, 1920), "pamphlet": (1240, 1754)}


def _dims(fmt: str) -> tuple[int, int]:
    return _FORMAT_DIMS.get(fmt, (1080, 1080))


def _entry_refs(db: Session, agent: User, ids: list[int], now: datetime) -> list[dict]:
    """Visible entries → enriched refs carrying the entry's media links (MinIO/S3 object keys), so
    the stored workspace is self-contained. Order preserved; stale/non-visible entries dropped."""
    return [
        {
            "entry_id": e.id,
            "title": e.title,
            "type": e.type.value,
            "cover_object_key": e.cover_object_key or "",
            "media_keys": list(e.asset_keys or []),
        }
        for e in agent_visible_entries_by_ids(db, agent, ids, now=now)
    ]


def _seed_workspace(
    db: Session, agent: User, *, name: str, fmt: str, design: dict,
    collection_id: int | None, item_ids: list[int], now: datetime,
) -> dict:
    """Build the initial workspace when a project is created (from a collection, or legacy ids)."""
    w, h = _dims(fmt)
    collections: list[dict] = []
    if collection_id is not None:
        coll = db.get(Collection, collection_id)
        if coll is not None and coll.agent_id == agent.id:
            collections = [{
                "collection_id": coll.id, "name": coll.name,
                "entries": _entry_refs(db, agent, coll.item_ids or [], now),
            }]
    elif item_ids:
        collections = [{
            "collection_id": 0, "name": "Saved items",
            "entries": _entry_refs(db, agent, item_ids, now),
        }]
    scenes = design.get("scenes", []) if isinstance(design, dict) else []
    return {
        "metadata": {"name": name, "format": fmt, "width": w, "height": h, "version": 1},
        "reference_content": {"collections": collections, "uploads": [], "generated": []},
        "scenes": scenes,
    }


def _migrate_workspace(project: Composition) -> dict:
    """Build a workspace for a legacy project that has none, from its item_ids + design."""
    w, h = _dims(project.format)
    d = project.design if isinstance(project.design, dict) else {}
    scenes = d.get("scenes") or d.get("pages") or []
    collections = (
        [{"collection_id": 0, "name": "Saved items",
          "entries": [{"entry_id": i, "title": "", "type": ""} for i in (project.item_ids or [])]}]
        if project.item_ids else []
    )
    return {
        "metadata": {
            "name": project.name, "format": project.format,
            "width": w, "height": h, "version": 1,
        },
        "reference_content": {"collections": collections, "uploads": [], "generated": []},
        "scenes": scenes,
    }


def _workspace_of(project: Composition) -> dict:
    return project.workspace if project.workspace else _migrate_workspace(project)


def _ids_from_ws(ws: dict) -> list[int]:
    ids: list[int] = []
    for c in ws.get("reference_content", {}).get("collections", []):
        for e in c.get("entries", []):
            if e["entry_id"] not in ids:
                ids.append(e["entry_id"])
    return ids


def _owned_assets(db: Session, agent: User, refs: list[dict]) -> list[AssetRef]:
    out: list[AssetRef] = []
    for a in refs:
        ua = db.get(UserAsset, a.get("asset_id"))
        if ua is not None and ua.owner_id == agent.id:
            out.append(AssetRef(
                asset_id=ua.id, object_key=ua.object_key, kind=ua.kind.value,
                content_type=ua.content_type, title=ua.title, source=ua.source.value,
            ))
    return out


def _resolve_workspace(db: Session, agent: User, ws: dict, now: datetime) -> WorkspaceResolved:
    rc = ws.get("reference_content", {})
    cols = []
    for c in rc.get("collections", []):
        ids = [e["entry_id"] for e in c.get("entries", [])]
        entries = agent_visible_entries_by_ids(db, agent, ids, now=now)
        cols.append(ResolvedCollection(
            collection_id=c.get("collection_id", 0), name=c.get("name", ""),
            entries=[EntryOut.from_entry(e, now=now) for e in entries],
        ))
    return WorkspaceResolved(
        metadata=WorkspaceMetadata(**ws.get("metadata", {})),
        reference_content=ResolvedReferenceContent(
            collections=cols,
            uploads=_owned_assets(db, agent, rc.get("uploads", [])),
            generated=_owned_assets(db, agent, rc.get("generated", [])),
        ),
        scenes=ws.get("scenes", []),
    )


@router.get("/projects/{project_id}/workspace", response_model=WorkspaceResolved)
def get_workspace(
    project_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> WorkspaceResolved:
    """The structured workspace (AC64), resolved: references expanded to live entries + assets."""
    project = _owned_project(db, project_id, agent)
    return _resolve_workspace(db, agent, _workspace_of(project), now)


@router.put("/projects/{project_id}/workspace", response_model=WorkspaceResolved)
def save_workspace(
    project_id: int,
    body: WorkspaceIn,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> WorkspaceResolved:
    """Autosave the whole workspace (AC64). Validates references (visible entries, owned assets),
    bumps the version, and keeps item_ids/design in sync for the compat resolve/export paths."""
    project = _owned_project(db, project_id, agent)
    ws = body.model_dump()
    prev = project.workspace.get("metadata", {}).get("version", 0) if project.workspace else 0
    ws["metadata"]["version"] = prev + 1
    rc = ws["reference_content"]
    # Re-resolve each collection's entries against the live catalog: drops non-visible ones and
    # refreshes the stored media links (so reference_content always carries current S3 keys).
    for c in rc["collections"]:
        ids = [x["entry_id"] for x in c["entries"]]
        c["entries"] = _entry_refs(db, agent, ids, now)
    owned = {a.asset_id for a in _owned_assets(db, agent, rc["uploads"] + rc["generated"])}
    rc["uploads"] = [a for a in rc["uploads"] if a["asset_id"] in owned]
    rc["generated"] = [a for a in rc["generated"] if a["asset_id"] in owned]

    project.workspace = ws
    project.name = ws["metadata"]["name"] or project.name
    project.format = ws["metadata"]["format"]
    project.item_ids = _ids_from_ws(ws)
    project.item_versions = _snapshot_item_versions(db, project.item_ids)
    project.design = {
        "format": ws["metadata"]["format"], "width": ws["metadata"]["width"],
        "height": ws["metadata"]["height"], "scenes": ws["scenes"],
    }
    db.commit()
    db.refresh(project)
    return _resolve_workspace(db, agent, project.workspace, now)


@router.put("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
) -> Composition:
    project = _owned_project(db, project_id, agent)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "format", "item_ids", "design"):
        if field in data and data[field] is not None:
            setattr(project, field, data[field])
    # Re-snapshot captured versions whenever the item set changes (AC33).
    if "item_ids" in data and data["item_ids"] is not None:
        project.item_versions = _snapshot_item_versions(db, data["item_ids"])
    db.commit()
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> None:
    db.delete(_owned_project(db, project_id, agent))
    db.commit()


# ------------------------------------------------------------------ collections
@router.get("/collections", response_model=list[CollectionOut])
def list_collections(
    db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> list[Collection]:
    return list(
        db.execute(
            select(Collection).where(Collection.agent_id == agent.id).order_by(Collection.id.desc())
        )
        .scalars()
        .all()
    )


def _visible_ids(db: Session, agent: User, ids: list[int], now: datetime) -> list[int]:
    """Keep only the entry ids currently visible to the agent, in order (AC60) — collections
    store references, so a saved id that is expired/hidden/deleted is dropped."""
    return [e.id for e in agent_visible_entries_by_ids(db, agent, ids, now=now)]


@router.post("/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> Collection:
    collection = Collection(
        agent_id=agent.id, name=body.name, item_ids=_visible_ids(db, agent, body.item_ids, now)
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return collection


def _owned_collection(db: Session, collection_id: int, agent: User) -> Collection:
    collection = db.get(Collection, collection_id)
    if collection is None or collection.agent_id != agent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found")
    return collection


@router.put("/collections/{collection_id}", response_model=CollectionOut)
def update_collection(
    collection_id: int,
    body: CollectionUpdate,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> Collection:
    collection = _owned_collection(db, collection_id, agent)
    if body.name is not None:
        collection.name = body.name
    if body.item_ids is not None:
        collection.item_ids = _visible_ids(db, agent, body.item_ids, now)
    db.commit()
    db.refresh(collection)
    return collection


@router.get("/collections/{collection_id}/resolved", response_model=CollectionResolved)
def resolve_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> CollectionResolved:
    """A collection's items (AC60): resolved against the live catalog, with stale refs dropped."""
    collection = _owned_collection(db, collection_id, agent)
    entries = agent_visible_entries_by_ids(db, agent, collection.item_ids, now=now)
    visible = {e.id for e in entries}
    return CollectionResolved(
        id=collection.id,
        name=collection.name,
        items=[EntryOut.from_entry(e, now=now) for e in entries],
        dropped_item_ids=[i for i in collection.item_ids if i not in visible],
    )


@router.post("/collections/{collection_id}/items", response_model=CollectionOut)
def add_collection_item(
    collection_id: int,
    body: CollectionItemAdd,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
    now: datetime = Depends(clock.now),
) -> Collection:
    """Save an entry reference into a collection (AC59). Rejects entries not visible to you."""
    collection = _owned_collection(db, collection_id, agent)
    if not agent_visible_entries_by_ids(db, agent, [body.entry_id], now=now):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not available")
    if body.entry_id not in collection.item_ids:
        collection.item_ids = [*collection.item_ids, body.entry_id]
        db.commit()
        db.refresh(collection)
    return collection


@router.delete("/collections/{collection_id}/items/{entry_id}", response_model=CollectionOut)
def remove_collection_item(
    collection_id: int,
    entry_id: int,
    db: Session = Depends(get_db),
    agent: User = Depends(_agent_only),
) -> Collection:
    """Remove a saved entry reference from a collection (AC59)."""
    collection = _owned_collection(db, collection_id, agent)
    collection.item_ids = [i for i in collection.item_ids if i != entry_id]
    db.commit()
    db.refresh(collection)
    return collection


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: int, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> None:
    db.delete(_owned_collection(db, collection_id, agent))
    db.commit()


# ------------------------------------------------------------------ brand kit
@router.get("/brand-kit", response_model=BrandKitOut)
def get_brand_kit(db: Session = Depends(get_db), agent: User = Depends(_agent_only)) -> BrandKit:
    kit = db.execute(select(BrandKit).where(BrandKit.agent_id == agent.id)).scalar_one_or_none()
    if kit is None:
        kit = BrandKit(agent_id=agent.id)
        db.add(kit)
        db.commit()
        db.refresh(kit)
    return kit


@router.put("/brand-kit", response_model=BrandKitOut)
def update_brand_kit(
    body: BrandKitUpdate, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> BrandKit:
    kit = db.execute(select(BrandKit).where(BrandKit.agent_id == agent.id)).scalar_one_or_none()
    if kit is None:
        kit = BrandKit(agent_id=agent.id)
        db.add(kit)
    data = body.model_dump(exclude_unset=True)
    for field in (
        "logo_url",
        "primary_color",
        "accent_color",
        "contact_name",
        "contact_email",
        "website",
    ):
        if field in data and data[field] is not None:
            setattr(kit, field, data[field])
    db.commit()
    db.refresh(kit)
    return kit


# ------------------------------------------------------------------ templates
@router.get("/design-templates", response_model=list[DesignTemplate])
def design_templates(agent: User = Depends(_agent_only)) -> list[DesignTemplate]:
    return _TEMPLATES
