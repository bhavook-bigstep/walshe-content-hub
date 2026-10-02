"""Super Admin routes (AC2): list users + approve a content provider. Guarded by role."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.user import Role, Tenant, User
from app.schemas.auth import AdminCreateUserRequest, UserOut
from app.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

_admin_only = require_role(Role.super_admin)


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(_admin_only),
) -> list[User]:
    return list(db.execute(select(User).order_by(User.id)).scalars().all())


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    body: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    _: User = Depends(_admin_only),
) -> User:
    """Super Admin provisions a user (AC24). Can create a Content Provider or Tourism Agent, never
    another Super Admin (that role stays seeded). A provider is tied to its organization (tenant)
    and starts unapproved until verified (AC2); an agent is usable immediately."""
    if body.role == Role.super_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot create another Super Admin")
    if db.execute(select(User).where(User.email == body.email)).scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    tenant_id: int | None = None
    if body.role == Role.content_provider:
        org = (body.organization or "").strip()
        if not org:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "A Content Provider needs an organization name",
            )
        tenant = db.execute(select(Tenant).where(Tenant.name == org)).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(name=org)
            db.add(tenant)
            db.flush()  # assign tenant.id before linking the user
        tenant_id = tenant.id

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
        tenant_id=tenant_id,
        approved=body.role == Role.tourism_agent,  # providers await verification (AC2)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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
