"""Application settings — every value comes from the environment (Contract 2: no secrets in code).

Keys (``ANTHROPIC_API_KEY`` etc.) are read from env only and are *never* logged or serialised;
see ``app.ai.factory`` which logs the provider *name*, never its key.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict

# A world-known placeholder that was previously the default signing secret. It must never sign real
# tokens; ``app.main.create_app`` fails fast if it (or an empty secret) reaches startup.
INSECURE_JWT_SECRET = "dev-only-insecure-secret-change-me"


class Settings(BaseSettings):
    """Runtime configuration, loaded from environment variables / a local ``.env``.

    The ``database_url`` default is safe-for-dev (sqlite). ``jwt_secret`` has **no** usable default:
    every real run must supply ``JWT_SECRET`` via the environment, and ``create_app`` refuses to
    start without one (no silent fallback to a committed secret).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Storage
    database_url: str = "sqlite+pysqlite:///./content_hub.db"

    # Auth — must be provided via JWT_SECRET; empty default forces an explicit configuration.
    jwt_secret: str = ""
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
