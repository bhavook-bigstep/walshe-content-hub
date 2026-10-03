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
from app.models.catalog import CatalogEntry
from app.models.composition import Composition
from app.models.user import Role, User
from app.schemas.agent import (
    BrandKitOut,
    BrandKitUpdate,
    CollectionCreate,
    CollectionOut,
    CollectionUpdate,
    DesignTemplate,
    ProjectCreate,
    ProjectOut,
    ProjectResolved,
    ProjectUpdate,
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
    body: ProjectCreate, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> Composition:
    project = Composition(
        agent_id=agent.id,
        name=body.name,
        format=body.format,
        item_ids=body.item_ids,
        design=body.design,
        item_versions=_snapshot_item_versions(db, body.item_ids),
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


@router.post("/collections", response_model=CollectionOut, status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate, db: Session = Depends(get_db), agent: User = Depends(_agent_only)
) -> Collection:
    collection = Collection(agent_id=agent.id, name=body.name, item_ids=body.item_ids)
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
) -> Collection:
    collection = _owned_collection(db, collection_id, agent)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "item_ids"):
        if field in data and data[field] is not None:
            setattr(collection, field, data[field])
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
