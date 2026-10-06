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

    # --- Instagram publishing (Graph API with Instagram Login) + S3 media hosting ---
    # Secrets come from the environment only (Contract 2); never stored in the DB or logged.
    # With no token/user id set, the publish layer falls back to a deterministic stub connector.
    instagram_access_token: str | None = None
    ig_user_id: str | None = None
    graph_api_version: str = "v26.0"
    s3_bucket: str | None = None
    s3_region: str | None = None
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    # Custom endpoint for S3-compatible stores (Supabase / R2 / MinIO). Empty = AWS S3.
    s3_endpoint_url: str | None = None
    # Public read base for a public bucket (e.g. Supabase .../object/public/<bucket>). When set,
    # uploads return "<base>/<key>"; empty = presigned GET for a private bucket.
    s3_public_base_url: str | None = None
    s3_presign_ttl: int = 3600

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def instagram_configured(self) -> bool:
        """True when a real token + user id are set; else the publish layer uses the stub."""
        return bool(self.instagram_access_token and self.ig_user_id)

    def s3_configured(self) -> bool:
        """True only when bucket, region, and both AWS keys are present."""
        return bool(
            self.s3_bucket
            and self.s3_region
            and self.aws_access_key_id
            and self.aws_secret_access_key
        )


def get_settings() -> Settings:
    """Return a fresh Settings instance (overridable in tests via dependency_overrides)."""
    return Settings()
