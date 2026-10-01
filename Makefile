# Gate 6 — `make verify` is the single end-to-end proof that AC1-AC18 are met.
# Order: lint -> api tests -> web typecheck -> web unit -> e2e -> acceptance matrix -> spec sync -> compose.
# The matrix step regenerates the run ledger block (never hand-edit it) and fails if any AC is not met.
# Any failing step stops the run (make aborts on the first non-zero exit).

API_DIR := apps/api
WEB_DIR := apps/web
ROOT    := $(CURDIR)
API_REPORT := $(ROOT)/$(API_DIR)/.report.json
WEB_REPORT := $(ROOT)/$(WEB_DIR)/.vitest.json
E2E_REPORT := $(ROOT)/$(WEB_DIR)/.e2e.json
LEDGER := docs/plans/2026-10-01-run-ledger.md

.PHONY: verify lint api-test api-types-sync web-typecheck web-test e2e matrix sync compose-config

verify: lint api-test api-types-sync web-typecheck web-test e2e matrix sync compose-config
	@echo "verify: all gates passed"

lint:
	cd $(API_DIR) && uv run ruff check .

# pytest runs from the repo root with rootdir pinned to apps/api so the json-report node-ids are
# repo-relative (apps/api/tests/... and scripts/tests/...) and match the proof manifest exactly.
# The scripts/tests governance suite is included because AC18's proofs live there; without it the
# acceptance matrix cannot see those passing tests.
api-test:
	uv run --project $(API_DIR) --with pyyaml pytest \
		--rootdir "$(ROOT)" -c $(API_DIR)/pyproject.toml \
		$(API_DIR)/tests scripts/tests -o testpaths= -p no:cacheprovider \
		-q --json-report --json-report-file=$(API_REPORT)

# Drift guard: committed openapi.json / api-types.ts must match the Pydantic models.
# Runs under the api venv (uv) so dump_openapi can import the Pydantic models; the script itself
# shells out to node + openapi-typescript to regenerate the TS types for the byte-for-byte compare.
api-types-sync:
	uv run --project $(API_DIR) python scripts/check_api_types_sync.py

web-typecheck:
	cd $(WEB_DIR) && pnpm exec tsc --noEmit

web-test:
	cd $(WEB_DIR) && pnpm exec vitest run --reporter=json --outputFile=$(WEB_REPORT)

# The Playwright config pins no keys, so the AI layer uses its deterministic stub.
e2e:
	cd $(WEB_DIR) && PLAYWRIGHT_JSON_OUTPUT_NAME=$(E2E_REPORT) pnpm exec playwright test --reporter=json

matrix:
	uv run --no-project --with pyyaml python scripts/acceptance_matrix.py \
		--manifest requirements.manifest.yaml \
		--api-report $(API_REPORT) --web-report $(WEB_REPORT) --e2e-report $(E2E_REPORT) \
		--write-ledger $(LEDGER) --check

sync:
	uv run --no-project --with pyyaml python scripts/check_requirements_sync.py

compose-config:
	docker compose -f infra/docker-compose.yml config -q
