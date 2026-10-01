"""Application settings — every value comes from the environment (Contract 2: no secrets in code).

Keys (``ANTHROPIC_API_KEY`` etc.) are read from env only and are *never* logged or serialised;
see ``app.ai.factory`` which logs the provider *name*, never its key.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment variables / a local ``.env``.

    Defaults are safe-for-dev only (sqlite, a throwaway signing secret). Production supplies a
    Postgres ``DATABASE_URL`` and a real ``JWT_SECRET`` via the environment.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Storage
    database_url: str = "sqlite+pysqlite:///./content_hub.db"

    # Auth
    jwt_secret: str = "dev-only-insecure-secret-change-me"
    token_ttl_seconds: int = 60 * 60 * 8

    # MinIO / object storage (real backend used only when configured)
    minio_endpoint: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket: str = "content-hub"

    # AI provider selection: claude | openai | gemini (falls back to a deterministic stub
    # whenever the matching key is absent — see app.ai.factory.get_provider).
    ai_provider: str = "claude"
    ai_model: str = "claude-sonnet-5-5"
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    gemini_api_key: str | None = None


def get_settings() -> Settings:
    """Return a fresh Settings instance (overridable in tests via dependency_overrides)."""
    return Settings()
