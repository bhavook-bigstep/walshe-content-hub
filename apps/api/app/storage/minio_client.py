"""Storage backends (AC4).

A single ``Storage`` interface with two implementations: an in-memory fake (hermetic tests +
key-less dev) and a MinIO-backed one (imported lazily, only when configured). Agent image uploads
and the demo all go through this interface, never a raw client.
"""
from __future__ import annotations

import abc

from app.config import Settings


class Storage(abc.ABC):
    @abc.abstractmethod
    def put_object(self, key: str, data: bytes, content_type: str) -> None: ...

    @abc.abstractmethod
    def get_object(self, key: str) -> tuple[bytes, str]:
        """Return ``(data, content_type)`` or raise ``KeyError`` if absent."""


class InMemoryStorage(Storage):
    def __init__(self) -> None:
        self._objects: dict[str, tuple[bytes, str]] = {}

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        self._objects[key] = (data, content_type)

    def get_object(self, key: str) -> tuple[bytes, str]:
        return self._objects[key]


class MinioStorage(Storage):  # pragma: no cover - requires a live MinIO, not exercised in tests
    def __init__(self, settings: Settings) -> None:
        from minio import Minio  # imported lazily so the package is optional for tests/dev

        self._bucket = settings.minio_bucket
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=False,
        )
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def put_object(self, key: str, data: bytes, content_type: str) -> None:
        import io

        self._client.put_object(
            self._bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
        )

    def get_object(self, key: str) -> tuple[bytes, str]:
        resp = self._client.get_object(self._bucket, key)
        try:
            return resp.read(), resp.headers.get("Content-Type", "application/octet-stream")
        finally:
            resp.close()
            resp.release_conn()


def get_storage(settings: Settings) -> Storage:
    """Return a MinIO-backed store when configured, else the in-memory fake."""
    if settings.minio_endpoint and settings.minio_access_key and settings.minio_secret_key:
        return MinioStorage(settings)
    return InMemoryStorage()
