#!/usr/bin/env python3
"""Dump the FastAPI OpenAPI schema deterministically (Finding F1 / plan 10.1).

Builds the app via ``app.main:create_app`` with an in-memory SQLite ``Settings`` (no network, no
MinIO, no AI keys) and writes ``app.openapi()`` as sorted-key JSON, so the Pydantic models are the
single source for the generated TypeScript types.

Usage::

    python scripts/dump_openapi.py OUT_PATH
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_DIR = REPO_ROOT / "apps" / "api"


def build_schema() -> dict:
    """Return the OpenAPI document of a hermetic app instance."""
    if str(API_DIR) not in sys.path:
        sys.path.insert(0, str(API_DIR))
    from app.config import Settings
    from app.main import create_app

    settings = Settings(
        _env_file=None,
        database_url="sqlite+pysqlite:///:memory:",
        jwt_secret="openapi-dump-not-a-real-secret",  # schema dump only; no tokens are signed
        minio_endpoint=None,
        minio_access_key=None,
        minio_secret_key=None,
        anthropic_api_key=None,
        openai_api_key=None,
        gemini_api_key=None,
    )
    return create_app(settings).openapi()


def render(schema: dict) -> str:
    """Canonical serialisation: sorted keys, 2-space indent, trailing newline."""
    return json.dumps(schema, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("usage: dump_openapi.py OUT_PATH", file=sys.stderr)
        return 2
    out = Path(args[0])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(build_schema()), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
