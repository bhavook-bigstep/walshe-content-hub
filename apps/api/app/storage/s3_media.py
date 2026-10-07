"""Upload a post image to S3 and return a presigned GET URL for Instagram to fetch.

Instagram's Graph API fetches ``image_url`` server-side, so the media must sit at a publicly
reachable URL (spec §8, gap #2). A presigned GET URL (TTL ``settings.s3_presign_ttl``) satisfies
that without making the bucket public. AWS credentials come from env only (Contract 2). ``_client``
is isolated so tests monkeypatch it and run without boto3/AWS.
"""

from __future__ import annotations

from app.config import Settings


def _client(settings: Settings):
    import boto3  # imported lazily so test/dev paths that monkeypatch _client need no AWS

    kwargs: dict = {
        "region_name": settings.s3_region,
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
    }
    # S3-compatible stores (Supabase / R2 / MinIO) need the endpoint + path-style addressing.
    if settings.s3_endpoint_url:
        from botocore.config import Config

        kwargs["endpoint_url"] = settings.s3_endpoint_url
        kwargs["config"] = Config(s3={"addressing_style": "path"})
    return boto3.client("s3", **kwargs)


def upload_jpeg(settings: Settings, key: str, data: bytes) -> str:
    """Put ``data`` as image/jpeg at ``key`` and return a presigned GET URL. Requires S3 config."""
    if not settings.s3_configured():
        raise RuntimeError("S3 is not configured (set S3_BUCKET/S3_REGION + AWS keys in the env)")
    client = _client(settings)
    client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="image/jpeg")
    if settings.s3_public_base_url:
        # Public bucket (e.g. Supabase): a permanent public URL, no presign.
        return f"{settings.s3_public_base_url.rstrip('/')}/{key}"
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=settings.s3_presign_ttl,
    )
