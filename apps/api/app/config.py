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

    # Object storage. Precedence (see app.storage.minio_client.get_storage):
    #   asset_dir  → a persistent on-disk store (local dev: seed + API share one directory)
    #   minio_*    → a MinIO/S3 bucket (compose / prod)
    #   neither    → an in-memory store (hermetic tests only)
    asset_dir: str | None = None
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

    # AI image generation (AC52): the provider + model used to generate entry cover art and the
    # agent media library's images. Defaults to Gemini 2.5 Flash Image (aka "nano-banana"); with no
    # GEMINI_API_KEY it falls back to a deterministic solid-colour stub (no egress, hermetic tests)
    # — see app.ai.images.generate_image.
    ai_image_provider: str = "gemini"
    ai_image_model: str = "gemini-2.5-flash-image"

    # Observability (AC45). LangSmith tracing is OFF by default — no key, no egress, hermetic tests.
    # Set LANGSMITH_API_KEY (+ optional LANGSMITH_PROJECT) to export the agent loop + creative plan
    # + provider calls to LangSmith. The in-app trace store always records a content-free run row.
    langsmith_api_key: str | None = None
    langsmith_project: str = "walsh-content-hub"

    def langsmith_enabled(self) -> bool:
        return bool(self.langsmith_api_key)

    # Browser CORS: comma-separated allowed origins. Empty (prod default) = no CORS middleware
    # (the web app is served same-origin / behind one origin in prod). Dev and e2e set the local
    # web origin(s) so the browser may call the API cross-port.
    cors_origins: str = ""

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def get_settings() -> Settings:
    """Return a fresh Settings instance (overridable in tests via dependency_overrides)."""
    return Settings()
