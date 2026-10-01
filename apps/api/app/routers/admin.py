"""Super Admin routes (AC2): list users + approve a content provider. Guarded by role."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.user import Role, User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/admin", tags=["admin"])

_admin_only = require_role(Role.super_admin)


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(_admin_only),
) -> list[User]:
    return list(db.execute(select(User).order_by(User.id)).scalars().all())


@router.post("/providers/{user_id}/approve", response_model=UserOut)
def approve_provider(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(_admin_only),
) -> User:
    user = db.get(User, user_id)
    if user is None or user.role != Role.content_provider:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Content provider not found")
    user.approved = True
    db.commit()
    db.refresh(user)
    return user
