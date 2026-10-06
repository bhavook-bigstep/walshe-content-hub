"""Auto-Catalog agent routes (AC64–AC74) — provider-only.

A provider uploads a document (PDF / PNG / JPEG); the import runs **asynchronously** (AC71): the
handler validates the upload at the boundary, reads the bytes, enqueues an owner-scoped ``Job`` and
returns **202** *without* blocking on the LLM. An in-process background task
(``app.services.auto_catalog_jobs``) distils the content, extracts embedded images (AC72), runs the
tool-call agent (AC73) and turns it into **1..N draft catalog entries** in the provider's own
catalog. Every generated entry is a **draft** (``EntryVisibility.draft``, ``status=draft``,
``brand_safe=False``) carrying the **AI-created** marker (AC68) — invisible to agents (Contract 1)
until the provider reviews, edits and publishes it (AC69). ``GET /me/jobs`` backs the navbar bell
(AC74). Deterministic with the stub; logs counts only, never document text or keys (Contracts 2/5).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.extract import SUPPORTED_CONTENT_TYPES
from app.ai.factory import get_provider
from app.config import Settings
from app.deps import get_db, get_settings, require_role
from app.models.jobs import Job
from app.models.user import Role, User
from app.schemas.catalog import JobOut
from app.services.auto_catalog_jobs import run_import_job
from app.uploads import read_capped

logger = logging.getLogger("app.auto_catalog")

router = APIRouter(prefix="/me", tags=["auto-catalog"])

_provider_only = require_role(Role.content_provider)


@router.post(
    "/auto-catalog/import", response_model=JobOut, status_code=status.HTTP_202_ACCEPTED
)
async def import_document(
    file: UploadFile,
    request: Request,
    background_tasks: BackgroundTasks,
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> JobOut:
    """Accept a document and schedule an async import (AC71).

    Validates type + size at the boundary (AC64), reads the bytes (the ``UploadFile`` is closed once
    the 202 returns), enqueues a ``Job`` and schedules the extraction as a background task. The work
    — AC16 seam extraction (AC65), image extraction (AC72), tool-call draft creation (AC73) — runs
    after the response; this endpoint never blocks on the LLM."""
    if not provider.approved:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your organization is pending verification")
    content_type = (file.content_type or "").lower()
    if content_type not in SUPPORTED_CONTENT_TYPES:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Unsupported document type; allowed: PDF, PNG, JPEG",
        )
    # Read the bytes *now*: the UploadFile is closed once the 202 response is sent, so the task
    # cannot read it later. 25 MB cap (AC64); refuses oversize with 413.
    data = await read_capped(file)
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The uploaded file is empty")

    job = Job(provider_id=provider.id, filename=file.filename or "")
    db.add(job)
    db.commit()
    db.refresh(job)

    # Schedule the work after the response. The task opens its OWN session (the request session is
    # closed post-response) from the app's sessionmaker, and uses the app's storage + provider.
    background_tasks.add_task(
        run_import_job,
        job_id=job.id,
        filename=job.filename,
        content_type=content_type,
        data=data,
        session_factory=request.app.state.sessionmaker,
        storage=request.app.state.storage,
        ai_provider=get_provider(settings),
    )
    logger.info("auto-catalog import queued: provider_id=%s job_id=%s", provider.id, job.id)
    return JobOut.from_job(job)


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(
    provider: User = Depends(_provider_only),
    db: Session = Depends(get_db),
) -> list[JobOut]:
    """List the provider's own import jobs, newest first — backs the navbar bell (AC74).

    Owner-scoped (a provider never sees another's jobs); content-free (status + a safe summary)."""
    jobs = (
        db.execute(
            select(Job).where(Job.provider_id == provider.id).order_by(Job.id.desc()).limit(50)
        )
        .scalars()
        .all()
    )
    return [JobOut.from_job(j) for j in jobs]
