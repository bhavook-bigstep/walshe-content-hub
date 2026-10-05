"""Bounded upload reads — cap the in-memory body so an upload can't exhaust memory/storage."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB per file (images + short videos; PoC)


async def read_capped(file: UploadFile) -> bytes:
    """Read the whole upload, but refuse (413) anything over the cap — reads at most cap+1 bytes."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)",
        )
    return data
