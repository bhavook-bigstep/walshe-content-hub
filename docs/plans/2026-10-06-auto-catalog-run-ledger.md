# Run ledger — Auto-Catalog Agent (provider)

Durable state for the `/oneshot-poc:run`. Every phase reads this first and appends to it.
Content-free: status and decisions only, never secrets/PII.

- **Charter:** `docs/plans/2026-10-06-auto-catalog-agent-charter.md`  ·  **Branch:** `feat/provider-agentic` (worktree)
- **Spec:** `/REQUIREMENTS.md` v2.22.0 (AC64–AC70)
- **Current phase:** `C` (IMPLEMENT complete → ready for REVIEW)
- **Outer loop:** `0/3`  ·  **Inner loop:** `1/2`

## Requirement status (the acceptance checklist)

| # | Requirement | Status | Evidence / note (planned proof) |
|---|-------------|--------|-----------------|
| AC64 | Document upload (PDF/PNG/JPEG) in Provider section, capped + type-validated | met | `test_auto_catalog.py::test_import_rejects_bad_type_and_oversize` PASS (415 bad type, 413 oversize) |
| AC65 | AI extraction via AC16 seam; deterministic stub; keys never logged | met | `test_auto_catalog.py::test_extraction_uses_seam_and_pdf_text_local` PASS (pypdf local text fed to seam; stub stable) |
| AC66 | Extraction → 1..N draft entries, full field inference | met | `test_auto_catalog.py::test_entries_infer_fields_and_drop_ungrounded` PASS (type/title/location/season/attrs/highlights/tags; title-less block dropped; bogus attr dropped) |
| AC67 | Saved as drafts in provider catalog; invisible to agents (Contract 1) | met | `test_auto_catalog.py::test_generated_entries_are_drafts_invisible_to_agents` PASS (draft/draft/brand_safe=false; agent feed excludes them) |
| AC68 | AI-created marker + catalog filter | met | `test_auto_catalog.py::test_ai_created_marker_and_filter` PASS (`ai_created` flag + `?ai_created=` filter) |
| AC69 | Review/edit in existing editor, publish public/private (AC54 reuse) | met | `test_auto_catalog.py::test_generated_draft_edited_and_published` PASS (PUT edit + PATCH visibility=public → agent sees it) |
| AC70 | Deterministic in tests; AI mocked/stubbed; no secrets/PII in logs | met | `test_auto_catalog.py::test_determinism_and_no_pii_in_logs` PASS (identical entries twice; PII marker absent from logs) |

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | Scope QA → charter v1 confirmed; REQUIREMENTS bumped 2.21.0 → 2.22.0 (AC64–70) | approved |
| B1 (brainstorm) | Explored 4 pipeline approaches for AC64–70; chose **A — two-stage chained LLM (extract → structure)** mirroring the existing Builder agent. No new deps beyond pypdf. Requirement matrix unchanged (still `todo`; brainstorm is design-only). | approach picked |
| B2 (plan) | Concrete plan for AC64–70 written (exact files/functions, dependency graph, one test per AC). New: `pypdf>=5.0` dep · `CatalogEntry.ai_created` bool field · `app/ai/extract.py` two-stage pipeline (local pypdf text + deterministic sha-seeded stub) · `app/routers/auto_catalog.py` (`POST /me/auto-catalog/import`) · `EntryOut.ai_created` + `AutoCatalogResult` schema · `catalogs.list_my_entries` `ai_created` filter param · regen openapi/api-types (drift guard) · client `importAutoCatalog` + provider catalog import dialog/badge/filter · reuse existing editor + AC54 for review/publish (AC69). Matrix flipped `todo → planned` with per-AC test node ids. Must add AC64–70 rows to `requirements.manifest.yaml` (sync guard). No secrets/PII logged; all AI mocked/stubbed; sources re-verified live (pypdf + two-stage extraction). | plan ready |
| C1 (implement) | Built AC64–70 per plan. **API:** `CatalogEntry.ai_created` (indexed) · `app/ai/extract.py` (local pypdf text → stage-1 extract via AC16 seam → stage-2 structure; deterministic heuristic over `Label: value` blocks + GEO gazetteer for the stub/fallback; `_normalize_entry` drops title-less entries + ungrounded attrs) · `POST /me/auto-catalog/import` (type+size validated, drafts with `ai_created=True`, logs counts only) · `EntryOut.ai_created` + `AutoCatalogResult` · `/catalogs/mine/entries?ai_created=` filter · router registered. **Deps:** `pypdf>=5.0`. **Web:** `importAutoCatalog` + `listMyEntries(aiCreated?)` client, provider catalog Import dialog + AI-created badge + All/AI/Manual filter. **Contract:** regenerated `packages/shared/openapi.json` + `api-types.ts` (drift guard OK). **Manifest:** added AC64–70 rows (sync PASS, 70 items). **Tests:** `tests/test_auto_catalog.py` (7, one per AC) all PASS. Gates independently green: ruff clean · pytest **212 passed, 2 skipped** (incl. 7 new) · api-types-sync OK · web tsc exit 0 · vitest **29 passed** · requirements-sync PASS · compose config OK. Combined `make verify` (full e2e next-build + acceptance matrix) was executed to confirm all three reports feed the matrix. | implemented; gates green |

### Brainstorm outcome — pipeline architecture (B1)

Decision question: how to turn an uploaded PDF/image into 1..N draft entries via the AC16 seam while staying deterministic (Contract 4).

- **A — Two-stage chained LLM (extract → structure)** *(chosen)*: `complete()` call #1 extracts free-form tourism facts from locally-extracted PDF text (pypdf) / image; `complete()` call #2 maps facts → JSON array of draft entries, parsed like `builder._parse_ops`, deterministic stub fallback on both. Maps 1:1 to charter decisions #2/#3 and to the proven `build_design` shape (`apps/api/app/ai/builder.py:138`) — smallest diff, cheapest determinism. *Source:* two-step decoupling improves formatting reliability — python.langchain.com extraction docs — https://python.langchain.com/docs/use_cases/extraction (accessed 2026-10-06).
- **B — Single-stage (document → JSON entries in one call)**: fewer calls, lower latency/cost, but monolithic extraction underperforms on complex docs and couples concerns. *Source:* same langchain docs note two-stage outperforms monolithic on complex extraction.
- **C — Deterministic-first hybrid (local pypdf + regex/gazetteer pre-parse grounds one structured call)**: maximizes grounding of dates/locations, least hallucination, but more code + heuristic brittleness for a PoC. *Source:* Extract Text from a PDF — pypdf — https://pypdf.readthedocs.io/en/latest/user/extract-text.html (accessed 2026-10-06).
- **D — Generalize Builder's tool-use loop (agent calls `create_draft_entry` 1..N times)**: most "agentic", but repo's Builder is actually one-shot JSON-ops, not a multi-turn tool loop; a true loop is harder to make deterministic under the stub and heavier than a PoC needs. *Source:* **No source found — this is an AI-generated idea.**

**Chosen: A. Trade-off accepted:** two `complete()` calls per document (~2x latency/cost vs B), bought in exchange for reuse of the proven stub-fallback shape, cleaner full-field inference (AC66) in call #2, and better reviewability (Contract 4). For the stub path both stages are deterministic, so the extra call costs nothing in tests.

## Open assumptions / deferrals
- PDF text via pure-python `pypdf`; fall back to stub extraction if unavailable (keeps tests hermetic).
- Images sent as the "document"; stub path seeds extraction from bytes/filename (no real vision call in PoC).
- Drafts attach to the provider's single catalog (`catalogs/mine`, AC49); no new catalog created.
- "AI-created" marker is a new additive field on `CatalogEntry`.
- Deferred: OCR of scanned PDFs, per-provider vision tuning, async bulk ingestion, auto-publish (out of scope).

## Blockers (if STUCK)
- (none yet)
