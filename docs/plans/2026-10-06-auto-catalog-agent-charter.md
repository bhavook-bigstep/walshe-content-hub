# Auto-Catalog Agent — Requirements Charter

**Charter v2 · 2026-10-06** (v1 confirmed + built as AC64–70; v2 adds AC71–74 from ⏸G feedback) ·
branch `feat/provider-agentic` (worktree)

> **v2 amendment (⏸G feedback, 2026-10-06).** After verifying v1, the user expanded scope: the import
> should run **asynchronously** as a background **job** surfaced by a **navbar notification bell**; the
> agent should **extract embedded images** from the document, store them in MinIO (S3-compatible) and
> attach the object key/URL to the created entries; and entry creation + image attachment should go
> through an **LLM tool-call loop** that the server validates before inserting. Decisions (all
> `[explicit – feedback]`): image→entry mapping = **LLM tool-call**; async infra = **in-process
> background task + a `Job` table + polling** (no Redis/queue). Also folds in the already-applied
> **provider-failure fallback** (extract.py both stages + Gemini timeout 30→60s) which must ship with a
> regression test. New IDs **AC71–AC74** extend `/REQUIREMENTS.md` (v2.22.0 → v2.23.0). See the v2
> decisions + acceptance items at the end of this file.

> Living document. STUCK answers and gate (⏸G/⏸H) feedback amend it — new/changed rows tagged
> `[explicit – feedback]`, version bumped. The `acceptance-reviewer` checks against the current
> version. New requirement IDs **AC64–AC70** extend `/REQUIREMENTS.md` (v2.21.0 → v2.22.0 on
> confirmation).

## Goal (as stated)

> "Creating an auto catalog creating agent — the idea is to create a PDF, image parsing and
> extraction mechanism and then an agent will create relevant entries in the catalog, and will
> store them in draft so that the user can check them and edit if wanted and then publish to
> either public or private domain." — in the **Provider** section.

## Decisions

| # | Requirement / item | Decision | Provenance | Why (one line) |
|---|--------------------|----------|------------|----------------|
| 1 | Document upload (PDF + image) entry point in the Provider section | In scope | [explicit] | User asked for "PDF, image parsing and extraction"; provider owns catalog creation. |
| 2 | Parsing approach | Interpreted as: send the uploaded document to the AI provider (AC16 seam) and instruct it to **extract** relevant tourism info — step 1 | [explicit] | User: "for POC lets send the uploaded document to LLM and instruct it to extract relevant info… making our feature quick to deploy." |
| 3 | Entry generation from extracted info | Interpreted as: a second step turns the extracted info into **1..N draft catalog entries** | [explicit] | User chose "Multiple (1..N)" + "give the extracted data to create entries out of it." |
| 4 | Field inference depth | In scope: agent infers **every** entry field it can (type, title, description, country/state/city, season, per-type template attributes, highlights, market_tags) | [explicit] | User: "every field that the entry uses should be inferable… no harm as everything will be in draft." |
| 5 | Storage state | In scope: generated entries stored as **draft** (`EntryVisibility.draft`, `status=draft`, `brand_safe=false`) in the provider's own catalog (`catalogs/mine`) | [explicit] | User: "store them in draft so the user can check them"; Contract 1 — drafts are not distributable. |
| 6 | "AI-created" marker + filter | In scope: each generated entry carries an AI-created flag; provider catalog is **filterable** by it | [explicit] | User: "add a AI-created tag with it so it is easily filterable." |
| 7 | Review / edit | In scope: reuse the **existing entry editor** — no separate review screen | [explicit] | User chose "Reuse existing controls." |
| 8 | Publish to public / private | In scope: reuse the **existing AC54 visibility controls** (provider flips each draft to public or private manually) | [explicit] | User: "publish to either public or private domain"; chose reuse. |
| 9 | Determinism in tests | In scope: deterministic **stub** when no key; AI mocked/stubbed in tests; same input + stub ⇒ same drafts | [inferred] | Contract 4 (CLAUDE.md) — a PoC must be reviewable/reproducible. |
| 10 | Secrets / PII handling | In scope: provider keys from env only; never log keys or raw document PII; reference by id/location | [inferred] | Contracts 2 & 5 (`.claude/rules/security.md`). |
| 11 | Upload safety | In scope: reuse `read_capped` (25 MB cap); validate content-type (PDF/PNG/JPEG); parse inertly (no active content) | [inferred] | `.claude/rules/security.md` #3; existing `uploads.py` pattern. |
| 12 | PDF text extraction | In scope: extract text locally from PDFs (pure-python lib) to feed the LLM clean text; also drives the deterministic stub | [inferred] | No PDF *parsing* exists today (`media/pdf.py` only generates); keeps stub path hermetic. |
| 13 | Real multimodal vision tuning per provider | Deferred (post-PoC) | [inferred] | PoC sends extracted text; richer per-provider vision prompts are a production refinement. |
| 14 | OCR of scanned/image-only PDFs | Deferred (post-PoC) | [inferred] | OCR needs non-hermetic binaries; out of scope for a quick PoC. |
| 15 | Auto-publish / auto-approve of generated entries | Out of scope | [explicit] | User requires manual review before public/private — never auto-distribute (Contract 1). |
| 16 | Bulk async job queue / large-batch ingestion | Deferred (post-PoC) | [inferred] | PoC handles a single document synchronously; scale-out is production hardening. |

## Acceptance checklist (the contract — new AC IDs for `/REQUIREMENTS.md`)

- **AC64** — In the Provider section, a provider can open an **Auto-Catalog** import flow and
  upload a document (PDF, PNG, or JPEG), bounded by the existing 25 MB cap and validated by
  content-type. Invalid types/oversize are refused with a clear error.
- **AC65** — The uploaded document is sent to the configured AI provider via the AC16 seam with an
  instruction to **extract** relevant tourism info (PDF text extracted locally first). With no key,
  a **deterministic stub** produces stable extracted content (Contract 4). Keys are never logged
  (Contract 2).
- **AC66** — An agent turns the extracted info into **one or more** proposed draft catalog entries,
  inferring every field it can: `type` (event/place/opportunity/offer/itinerary), `title`,
  `description`, `destination` + `country/state/city`, `season`, per-type `attributes` (from
  `CONTENT_TEMPLATES`), `highlights`, and `market_tags`. Ungrounded/invalid fields are dropped or
  left blank, never fabricated into a published state.
- **AC67** — Generated entries are persisted as **drafts** (`EntryVisibility.draft`, `status=draft`,
  `brand_safe=false`) in the provider's own catalog, owned by the requesting provider with
  provenance captured. They are **not visible to any agent** (Contract 1) until the provider acts.
- **AC68** — Every AI-generated entry carries an **AI-created marker**, and the provider catalog can
  be **filtered** to show only AI-created (or only manual) entries.
- **AC69** — The provider **reviews and edits** a generated draft in the existing entry editor, then
  **publishes** it to **public or private** using the existing AC54 visibility controls. No separate
  review screen is introduced.
- **AC70** — Determinism & safety: same document + stub ⇒ identical proposed entries; the AI boundary
  is mocked/stubbed in tests; no secret or raw-document PII is written to logs or error messages.

## Out of scope / deferred

- Per-provider vision prompt tuning; OCR of image-only/scanned PDFs (non-hermetic binaries) — deferred.
- Auto-publish / auto-approve of generated entries — **out of scope** (manual review is required).
- Async job queue / large-batch bulk ingestion — deferred (PoC is single-document, synchronous).

## Open assumptions (defaulted, unconfirmed)

- PDF text extraction uses a **pure-python** library (`pypdf`) for a hermetic, dependency-light path;
  if unavailable in the toolchain, fall back to the stub extraction so tests still pass.
- Image uploads are sent to the model as the "document"; for the stub path the image's bytes/filename
  deterministically seed the extracted content (no vision call).
- Drafts attach to the provider's **single** catalog (`catalogs/mine`, AC49); no new catalog is created.
- The "AI-created" marker is a new boolean/provenance field on `CatalogEntry` (additive, nullable-safe).

---

## v2 amendment — Async jobs · images · tool-call insert · notification bell (AC71–AC74)

### Decisions (v2)

| # | Requirement / item | Decision | Provenance | Why (one line) |
|---|--------------------|----------|------------|----------------|
| 17 | Import runs asynchronously | In scope: `POST …/import` enqueues a **Job** and returns immediately; extraction runs in a background task | [explicit – feedback] | User: "make the llm processing an async process"; also fixes the sync timeout UX. |
| 18 | Async infrastructure | Interpreted as: **in-process background task + a `Job` table + polling** (no Redis/Celery) | [explicit – feedback] | User picked "In-process + Job table"; keeps PoC infra-free. |
| 19 | Navbar notification bell | In scope: provider app shell shows a **bell** that polls `/me/jobs`, shows in-progress/done counts + recent jobs with a link to the created drafts | [explicit – feedback] | User: "introduce a notification button on navbar which will carry the notification for each such async job." |
| 20 | Image extraction from the document | In scope: extract **embedded images** from PDFs (**PyMuPDF**), upload to MinIO via the existing storage seam, reference by object key (served by the existing media route) | [explicit – feedback] | User: "the llm should also extract relevant images from the files and give them to store in s3." |
| 21 | Image → entry mapping | Interpreted as: the agent runs an **LLM tool-call loop** calling `attach_image(entry_ref, image_ref)` | [explicit – feedback] | User picked "LLM tool-call mapping" + "we can make this tool call handled." |
| 22 | Tool-call entry creation | In scope: LLM emits entries and calls `create_entries(json)` / `attach_image(...)`; the **server validates** (reuse `EntryCreate`/`_normalize_entry`) before inserting | [explicit – feedback] | User: "agent should produce the json … an internal api will insert after validation." |
| 23 | Deterministic fallback for tool-call path | In scope: with no key/stub, entries + image attach are produced by the existing deterministic heuristic (images attached by page/order) | [inferred] | Contract 4 — the tool-call path must stay reproducible + hermetic in tests. |
| 24 | Provider-failure fallback (from the live defect) | In scope: a provider timeout/error degrades to the deterministic extractor (already applied) and ships with a **regression test** | [explicit – feedback] | Live ⏸G test: a 30s Gemini `ReadTimeout` 500'd the import; must never 500. |
| 25 | True AWS S3 (vs MinIO) | Deferred (post-PoC) | [inferred] | MinIO is S3-compatible; a cloud S3 bucket is production infra. |
| 26 | OCR of scanned/image-only PDFs | Still deferred | [inferred] | Unchanged from v1; non-hermetic binaries. |

### Acceptance checklist (v2 additions — new AC IDs)

- **AC71** — **Async import job.** `POST /me/auto-catalog/import` validates the upload at the boundary
  (type/size, AC64), **enqueues a `Job`** (status `queued → running → done | failed`, owner-scoped) and
  returns **202** with the job id *without* blocking on the LLM. Extraction runs in a background task.
  `GET /me/jobs` lists the provider's jobs with status + a result summary (drafts created, or an error
  message with no secret/PII). In tests the job runs synchronously/mocked and is deterministic.
- **AC72** — **Image extraction → MinIO.** Embedded images are extracted from the PDF (PyMuPDF),
  uploaded through the existing storage seam under an entry/asset key, and referenced by object key
  (served by the existing media route). PDFs with no usable image degrade cleanly (no cover). Images are
  parsed inertly (no active content). A directly-uploaded PNG/JPEG is itself the candidate image.
- **AC73** — **LLM tool-call entry creation + image attach.** The agent runs a tool-use loop exposing
  `create_entries(entries_json)` and `attach_image(entry_ref, image_ref)`; the **server validates** each
  call (valid type, grounded fields, real extracted image ref) before persisting, and drops
  invalid/ungrounded calls — entries stay **drafts** (Contract 1). With no key/stub, a deterministic
  fallback creates entries and attaches images by page/order (Contract 4). Attached images land as the
  entry **cover** (and/or an `Asset`).
- **AC74** — **Navbar notification bell.** The provider app shell shows a notification bell that polls
  `GET /me/jobs`, shows a badge for in-progress/just-completed jobs, and opens a list of recent jobs with
  status and a link to the drafts a finished job created. Empty/loading/error states handled.

### Out of scope / deferred (v2)

- Real AWS S3 bucket (MinIO stands in); Redis/Celery/RQ queue (in-process task stands in);
  WebSocket/SSE push for notifications (polling stands in) — all deferred post-PoC.

### Open assumptions (v2, defaulted)

- New dep **`pymupdf`**; new **`Job`** model (additive table; `create_all` reconciles).
- Background task = FastAPI `BackgroundTasks` / a worker thread sharing the app's DB session factory
  (its own session per job); tests invoke the job function directly for determinism.
- The bell polls on an interval (e.g. 10s) — no push transport in the PoC.
- `attach_image` cover reuses `CatalogEntry.cover_object_key`; extra images become `Asset` rows.
