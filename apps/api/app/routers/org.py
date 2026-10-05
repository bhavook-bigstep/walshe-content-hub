"""Organization profile (AC27) — a Content Provider owns and edits its org page. `verified` is
Super-Admin controlled (AC2), not editable here."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.user import Role, Tenant, User
from app.schemas.auth import OrganizationOut, OrganizationUpdate
from app.storage.minio_client import Storage
from app.uploads import read_capped

router = APIRouter(prefix="/me", tags=["organization"])

_provider_only = require_role(Role.content_provider)

# Logos are raster images only (no SVG/HTML — stored-markup defence, like entry images).
_ALLOWED_LOGO_TYPES = frozenset({"image/png", "image/jpeg"})


def _get_storage(request: Request) -> Storage:
    return request.app.state.storage


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


@router.post("/organization/logo", response_model=OrganizationOut)
async def upload_logo(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: User = Depends(_provider_only),
    storage: Storage = Depends(_get_storage),
) -> Tenant:
    """Upload the org logo (jpg/jpeg/png) → store it + point ``logo_url`` at the served asset."""
    tenant = _tenant_of(db, user)
    content_type = (file.content_type or "").lower()
    if content_type not in _ALLOWED_LOGO_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported image type; allowed: jpg, jpeg, png",
        )
    data = await read_capped(file)
    key = f"tenants/{tenant.id}/logo/{uuid.uuid4().hex}"
    storage.put_object(key, data, content_type)
    tenant.logo_url = f"/assets/{key}"
    db.commit()
    db.refresh(tenant)
    return tenant


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
