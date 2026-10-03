"""Off-limits blocklist management (AC36 / FR-08).

A board (content provider) or a super admin flags subjects/places off-limits. Enforcement lives in
``app.services.visibility`` — this router only curates the terms. Every change is audited (C3).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.deps import get_db, require_role
from app.models.blocklist import BlocklistTerm
from app.models.user import Role, User

router = APIRouter(prefix="/blocklist", tags=["blocklist"])

_board = require_role(Role.content_provider, Role.super_admin)


# A term must be specific enough not to blanket the catalog: a 1–2 char term would hide almost
# everything from every agent (a cross-board denial of service), so require at least 3 characters.
_MIN_TERM_LEN = 3


class BlocklistCreate(BaseModel):
    term: str = Field(min_length=1, max_length=200)


class BlocklistOut(BaseModel):
    id: int
    term: str
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[BlocklistOut])
def list_terms(db: Session = Depends(get_db), user: User = Depends(_board)) -> list[BlocklistTerm]:
    return list(db.execute(select(BlocklistTerm).order_by(BlocklistTerm.term)).scalars().all())


@router.post("", response_model=BlocklistOut, status_code=status.HTTP_201_CREATED)
def add_term(
    body: BlocklistCreate, db: Session = Depends(get_db), user: User = Depends(_board)
) -> BlocklistTerm:
    term = " ".join(body.term.split()).lower()  # collapse whitespace so "a  b" == "a b"
    if len(term) < _MIN_TERM_LEN:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Term must be at least {_MIN_TERM_LEN} characters",
        )
    existing = db.execute(select(BlocklistTerm).where(BlocklistTerm.term == term)).scalars().first()
    if existing is not None:
        return existing  # idempotent — adding the same term twice is a no-op
    row = BlocklistTerm(term=term, created_by=user.id)
    db.add(row)
    db.flush()
    audit.record(
        db,
        actor_id=user.id,
        action="blocklist_add",
        target_type="blocklist_term",
        target_id=row.id,
    )
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{term_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_term(term_id: int, db: Session = Depends(get_db), user: User = Depends(_board)) -> None:
    row = db.get(BlocklistTerm, term_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Term not found")
    # Only the term's creator or a super admin may remove it, so one provider cannot silently
    # re-expose content another board flagged off-limits (AC36 is global in this PoC).
    if user.role != Role.super_admin and row.created_by != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Term not found")
    audit.record(
        db,
        actor_id=user.id,
        action="blocklist_remove",
        target_type="blocklist_term",
        target_id=term_id,
    )
    db.delete(row)
    db.commit()
