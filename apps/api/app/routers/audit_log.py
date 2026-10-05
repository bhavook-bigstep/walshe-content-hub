"""Audit log read + export (AC37 / FR-16, Contract 3).

Rows are *written* by ``app.audit.record`` at each traceable action (withdraw/unpublish, access or
brand-safety change (overwrite), send-back, delete, publish, and blocklist add/remove). This router
exposes them read-only: a super admin sees every row; a content provider sees the actions they
performed. Export is CSV.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.deps import get_db, require_role
from app.models.audit import AuditLog
from app.models.user import Role, User

router = APIRouter(prefix="/audit", tags=["audit"])

_auditor = require_role(Role.content_provider, Role.super_admin)

_CSV_HEADER = ["id", "actor_id", "action", "target_type", "target_id", "created_at"]


class AuditOut(BaseModel):
    id: int
    actor_id: int
    action: str
    target_type: str
    target_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


def _rows(db: Session, user: User) -> list[AuditLog]:
    """Newest-first audit rows the caller may see: all for an admin, own actions for a provider."""
    stmt = select(AuditLog).order_by(AuditLog.id.desc())
    if user.role == Role.content_provider:
        stmt = stmt.where(AuditLog.actor_id == user.id)
    return list(db.execute(stmt).scalars().all())


@router.get("", response_model=list[AuditOut])
def list_audit(db: Session = Depends(get_db), user: User = Depends(_auditor)) -> list[AuditLog]:
    return _rows(db, user)


@router.get("/export")
def export_audit(db: Session = Depends(get_db), user: User = Depends(_auditor)) -> Response:
    """The same rows as a downloadable CSV (FR-16: records can be exported)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(_CSV_HEADER)
    for row in _rows(db, user):
        writer.writerow(
            [
                row.id,
                row.actor_id,
                row.action,
                row.target_type,
                row.target_id,
                row.created_at.isoformat(),
            ]
        )
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )
