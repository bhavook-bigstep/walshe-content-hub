"""Task 5 — S3 JPEG upload returning a presigned GET URL. boto3 client is monkeypatched (no AWS)."""

from __future__ import annotations

import pytest

from app.config import Settings
from app.storage import s3_media


class _FakeS3:
    def __init__(self) -> None:
        self.put: dict | None = None

    def put_object(self, **kw) -> None:
        self.put = kw

    def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803 - boto3 kwarg names
        assert op == "get_object"
        return f"https://s3/{Params['Bucket']}/{Params['Key']}?sig=1&ttl={ExpiresIn}"


def _s() -> Settings:
    return Settings(
        _env_file=None,
        s3_bucket="b",
        s3_region="r",
        aws_access_key_id="k",
        aws_secret_access_key="x",
        s3_presign_ttl=900,
    )


def test_upload_returns_presigned_url(monkeypatch):
    fake = _FakeS3()
    monkeypatch.setattr(s3_media, "_client", lambda settings: fake)
    url = s3_media.upload_jpeg(_s(), "posts/1/a.jpg", b"\xff\xd8\xff")
    assert fake.put["Bucket"] == "b"
    assert fake.put["Key"] == "posts/1/a.jpg"
    assert fake.put["ContentType"] == "image/jpeg"
    assert url.startswith("https://s3/b/posts/1/a.jpg")
    assert "ttl=900" in url


def test_upload_requires_config():
    with pytest.raises(RuntimeError):
        s3_media.upload_jpeg(Settings(_env_file=None), "k", b"x")


def test_upload_returns_public_url_when_base_set(monkeypatch):
    # Supabase (and other public buckets) serve reads from a public base URL, not an S3 presign.
    fake = _FakeS3()
    monkeypatch.setattr(s3_media, "_client", lambda settings: fake)
    s = Settings(
        _env_file=None,
        s3_bucket="content-hub-media",
        s3_region="ap-northeast-1",
        aws_access_key_id="k",
        aws_secret_access_key="x",
        s3_endpoint_url="https://ref.storage.supabase.co/storage/v1/s3",
        s3_public_base_url="https://ref.supabase.co/storage/v1/object/public/content-hub-media",
    )
    url = s3_media.upload_jpeg(s, "posts/1/a.jpg", b"\xff\xd8\xff")
    assert url == "https://ref.supabase.co/storage/v1/object/public/content-hub-media/posts/1/a.jpg"
    assert fake.put["Key"] == "posts/1/a.jpg"  # still uploaded via the S3 API


def test_client_targets_custom_endpoint_when_set():
    # S3-compatible stores (Supabase / R2 / MinIO) need the client pointed at their endpoint.
    s = Settings(
        _env_file=None,
        s3_bucket="b",
        s3_region="us-east-1",
        aws_access_key_id="k",
        aws_secret_access_key="x",
        s3_endpoint_url="https://ref.storage.supabase.co/storage/v1/s3",
    )
    client = s3_media._client(s)
    assert client.meta.endpoint_url == "https://ref.storage.supabase.co/storage/v1/s3"
