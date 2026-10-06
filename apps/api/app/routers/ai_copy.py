"""AI copy routes — Generate caption + Generate keywords for a composition (agent-only).

Both resolve the caller's composition, gather its catalog items' content through the Contract-1
visibility choke-point (hidden / out-of-scope items are dropped), build one clean prompt, and call
the configured ``AIProvider``. The stub provider makes the output deterministic with no key (AC16 /
Contract 4).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import clock
from app.ai.copy import CopyItem, generate_caption, generate_hashtags
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.composition import Composition
from app.models.user import Role, User
from app.schemas.ai_copy import AiCopyRequest, CaptionOut, KeywordsOut
from app.services.visibility import agent_visible_entries_by_ids

router = APIRouter(prefix="/ai", tags=["ai-copy"])

_agent_only = require_role(Role.tourism_agent)


def _composition_items(
    db: Session, user: User, composition_id: int, now: datetime
) -> list[CopyItem]:
    """Resolve an owned composition's catalog items into prompt-ready copy items.

    404 if the composition is missing or belongs to another agent (ownership gate, mirrors
    ``social._owned_composition``). Item ids go through ``agent_visible_entries_by_ids`` so only
    content the agent may actually see reaches the prompt (Contract 1).
    """
    comp = db.get(Composition, composition_id)
    if comp is None or comp.agent_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Composition not found")
    rows = agent_visible_entries_by_ids(db, user, comp.item_ids or [], now=now)
    return [
        CopyItem(title=r.title, destination=r.destination or "", description=r.description or "")
        for r in rows
    ]


@router.post("/caption", response_model=CaptionOut)
def caption(
    body: AiCopyRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> CaptionOut:
    items = _composition_items(db, user, body.composition_id, now)
    return CaptionOut(caption=generate_caption(items, get_provider(settings)))


@router.post("/keywords", response_model=KeywordsOut)
def keywords(
    body: AiCopyRequest,
    user: User = Depends(_agent_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    now: datetime = Depends(clock.now),
) -> KeywordsOut:
    items = _composition_items(db, user, body.composition_id, now)
    return KeywordsOut(hashtags=generate_hashtags(items, get_provider(settings)))
