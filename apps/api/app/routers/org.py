"""Organization profile (AC27) — a Content Provider owns and edits its org page. `verified` is
Super-Admin controlled (AC2), not editable here."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.user import Role, Tenant, User
from app.schemas.auth import OrganizationOut, OrganizationUpdate

router = APIRouter(prefix="/me", tags=["organization"])

_provider_only = require_role(Role.content_provider)


def _tenant_of(db: Session, user: User) -> Tenant:
    tenant = db.get(Tenant, user.tenant_id) if user.tenant_id is not None else None
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No organization for this account")
    return tenant


@router.get("/organization", response_model=OrganizationOut)
def get_organization(
    db: Session = Depends(get_db),
    user: User = Depends(_provider_only),
) -> Tenant:
    return _tenant_of(db, user)


@router.patch("/organization", response_model=OrganizationOut)
def update_organization(
    body: OrganizationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(_provider_only),
) -> Tenant:
    tenant = _tenant_of(db, user)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "blurb", "logo_url", "markets"):
        if field in data and data[field] is not None:
            setattr(tenant, field, data[field])
    db.commit()
    db.refresh(tenant)
    return tenant
