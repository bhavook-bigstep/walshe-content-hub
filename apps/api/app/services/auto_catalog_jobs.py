"""Async Auto-Catalog import job (AC71–AC73).

The ``POST /me/auto-catalog/import`` handler validates + reads the upload, inserts a
``Job(queued)``, and schedules ``run_import_job`` as an in-process background task. This module owns
the work that runs *after* the 202 response: it opens its **own** DB session (the request's session
is closed once the response is sent), distils facts + extracts images, runs the tool-call agent
(``app.ai.catalog_agent``) to propose entries, persists each as a hidden **draft** (Contract 1) with
the AI-created marker, stores any attached image as the entry cover through the storage seam (AC72),
and finally marks the job ``done`` (or ``failed`` with a short, safe message).

Determinism (Contract 4): with the stub provider the whole pipeline is deterministic, and tests
invoke ``run_import_job`` directly (or via the TestClient, which drains background tasks
synchronously). Safety (Contracts 2 & 5): logs counts only; a failure records the exception *type*,
never its message (which could echo document text), and never a key.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session, sessionmaker

from app.ai.base import AIProvider
from app.ai.catalog_agent import IMAGE_INDEX_KEY, plan_entries
from app.ai.extract import _extract_facts, document_images, document_text
from app.models.catalog import CatalogEntry, EntryStatus, EntryVisibility
from app.models.jobs import Job, JobStatus
from app.models.user import User
from app.routers.catalogs import provider_catalog
from app.storage.minio_client import Storage

logger = logging.getLogger("app.auto_catalog_jobs")


def run_import_job(
    *,
    job_id: int,
    filename: str,
    content_type: str,
    data: bytes,
    session_factory: sessionmaker[Session],
    storage: Storage,
    ai_provider: AIProvider,
) -> None:
    """Run one import to completion in its own session. Never raises — any failure is recorded on
    the job as ``failed`` with a safe, content-free message (AC71)."""
    db = session_factory()
    try:
        job = db.get(Job, job_id)
        if job is None:  # pragma: no cover - the handler always commits the job first
            logger.warning("auto-catalog job %s vanished before it could run", job_id)
            return
        provider = db.get(User, job.provider_id)
        if provider is None:  # pragma: no cover - owner is validated at request time
            _fail(db, job, "owner_missing")
            return
        job.status = JobStatus.running
        db.commit()

        try:
            images = document_images(filename, content_type, data)
            text = document_text(filename, content_type, data)
            facts = _extract_facts(text, ai_provider)
            proposals = plan_entries(facts, len(images), ai_provider)

            catalog = provider_catalog(db, provider)
            org_name = provider.tenant.name if provider.tenant else ""
            created: list[CatalogEntry] = []
            for fields in proposals:
                image_index = fields.get(IMAGE_INDEX_KEY)
                entry = CatalogEntry(
                    catalog_id=catalog.id,
                    type=fields["type"],
                    title=fields["title"],
                    description=fields["description"],
                    destination=fields["destination"],
                    country=fields["country"],
                    state=fields["state"],
                    city=fields["city"],
                    season=fields["season"],
                    market_tags=fields["market_tags"],
                    attributes=fields["attributes"],
                    highlights=fields["highlights"],
                    # Contract 1 (AC67): generated content is a hidden, unapproved draft.
                    visibility=EntryVisibility.draft,
                    status=EntryStatus.draft,
                    brand_safe=False,
                    ai_created=True,  # AC68 marker
                    provider_id=provider.id,
                    created_by_email=provider.email,
                    org_name=org_name,
                )
                db.add(entry)
                db.flush()  # assign entry.id so the cover key can reference it
                if isinstance(image_index, int) and 0 <= image_index < len(images):
                    _attach_cover(storage, entry, *images[image_index])
                created.append(entry)

            job.drafts_created = len(created)
            job.entry_ids = [e.id for e in created]
            job.status = JobStatus.done
            db.commit()
            logger.info(
                "auto-catalog job %s: provider_id=%s ai_provider=%s drafts=%d images=%d",
                job.id,
                provider.id,
                ai_provider.name,
                len(created),
                len(images),
            )
        except Exception as exc:  # noqa: BLE001 - never leak a message; record the type only
            _fail(db, job, type(exc).__name__)
    finally:
        db.close()


def _attach_cover(storage: Storage, entry: CatalogEntry, data: bytes, content_type: str) -> None:
    """Store one extracted image as the entry's cover (AC72/AC73) via the storage seam. The key is
    server-generated under ``entries/{id}/cover/`` — the same scheme as the manual cover upload."""
    key = f"entries/{entry.id}/cover/{uuid.uuid4().hex}"
    storage.put_object(key, data, content_type)
    entry.cover_object_key = key
    entry.cover_content_type = content_type


def _fail(db: Session, job: Job, reason: str) -> None:
    """Mark a job failed with a short, content-free reason (no document text, keys or PII)."""
    db.rollback()
    job.status = JobStatus.failed
    job.error = reason[:200]
    db.commit()
    logger.info("auto-catalog job %s failed: %s", job.id, reason)
