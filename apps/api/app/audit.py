"""Audit recording helper (Contract 3)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def record(
    db: Session, *, actor_id: int, action: str, target_type: str, target_id: int
) -> AuditLog:
    """Append an audit row for a destructive/traceable action. Caller commits."""
    entry = AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id)
    db.add(entry)
    db.flush()
    return entry
