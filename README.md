# Walsh Content Hub (proof of concept)

B2B Destination Content Hub: tourism boards publish verified content; travel agents turn it into
marketing assets (Design Studio) and run a social engagement layer. The governing spec is
`REQUIREMENTS.md` (acceptance items AC1-AC18).

Layout: `apps/api` (FastAPI) · `apps/web` (Next.js) · `infra` (Postgres + MinIO + API compose) ·
`scripts` (acceptance-matrix and spec-sync governance scripts).

Prerequisites: Docker, Python 3.12 with [uv](https://docs.astral.sh/uv/), Node with pnpm.

## Run the stack

```sh
docker compose -f infra/docker-compose.yml up --build   # Postgres, MinIO, API on :8000
```

Secrets come from the environment or a `.env` file; nothing is baked into the compose file.

### Seed synthetic data

With the stack up (or any `DATABASE_URL` set), seed the synthetic users and catalog:

```sh
cd apps/api
uv run python -c "from app.db import create_all, make_engine, make_sessionmaker; \
from app.config import get_settings; from app.seed import seed; \
e = make_engine(get_settings().database_url); create_all(e); s = make_sessionmaker(e)(); seed(s); s.close()"
```

### No key -> deterministic stub AI

The AI provider layer (Claude / OpenAI / Gemini, chosen by `AI_PROVIDER`) reads keys from the
environment only. If no key is set (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), it
falls back to a deterministic stub, so the Builder works offline and tests are repeatable.

## Development

```sh
cd apps/api && uv sync && uv run uvicorn app.main:create_app --factory --reload --port 8000
cd apps/web && pnpm install && NEXT_PUBLIC_API_URL=http://localhost:8000 pnpm dev
```

## Tests

```sh
cd apps/api && uv run pytest                 # API
cd apps/web && pnpm exec tsc --noEmit        # typecheck
cd apps/web && pnpm test                     # Vitest unit tests
cd apps/web && pnpm e2e                      # Playwright (builds web, throwaway SQLite API, no AI keys)
cd scripts && uv run --no-project --with pyyaml --with pytest python -m pytest tests   # governance scripts
```

## `make verify`

```sh
make verify
```

Runs in order: `ruff check`, API pytest (JSON report), `tsc --noEmit`, Vitest (JSON report),
Playwright (JSON report), `scripts/acceptance_matrix.py --write-ledger --check`,
`scripts/check_requirements_sync.py`, and `docker compose config -q`. The matrix step regenerates
the acceptance block in `docs/plans/2026-10-01-run-ledger.md` (never hand-edit it) and fails if any
AC is not proven, so AC18 is enforced end to end. The first failing step stops the run.
