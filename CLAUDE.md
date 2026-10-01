# CLAUDE.md

Guidance for Claude Code working in this repository. **This file says WHY. Rules say WHAT.
Guides say HOW.** They never swap roles.

## Project

| Property | Value |
| --- | --- |
| Project | Walsh Content Hub — a B2B Destination Content Hub: tourism boards publish verified content; travel agents turn it into marketing assets (incl. an AI-driven Canva-style studio) and run a social engagement layer |
| Stage | Proof of concept |
| Language / stack | Monorepo — **Next.js 15 · TypeScript · Tailwind** (web) · **Python 3.12 · FastAPI · SQLAlchemy · Alembic** (api) · **Postgres 16** · **MinIO** (assets); pnpm + turborepo + uv; Docker Compose |
| Test runner | **pytest** (api) · **Vitest** + **Playwright** (web) |
| Source of truth | Postgres (catalog, users, compositions, posts) + MinIO (binary assets). Charter: `docs/plans/2026-10-01-requirements-charter.md` |

## Compound Engineering

This repo follows the compound loop: **BRAINSTORM → PLAN → IMPLEMENT → REVIEW → COMPOUND**.
Each unit of work should make the next one easier. Before implementing, search
`docs/solutions/` for prior learnings; after solving something non-trivial, capture it with
`/oneshot-poc:compound`. See `AGENTS.md` for the workflow and approval gates.

## Architecture

Monorepo (pnpm + turborepo + uv):

```
apps/web    Next.js — three role UIs: Super Admin · Content Provider · Tourism Agent
apps/api    FastAPI — auth/RBAC, catalog CRUD, AI provider layer, Builder agent, media render
packages/shared   shared TS types + API client
infra       docker-compose: Postgres + MinIO
```

Data flow: **Provider** creates catalog entries (events/places/opportunities/offers/itineraries)
+ uploads images (MinIO) → marks brand-safe + sets access → **Agent** browses the approved
catalog → composes in the **Design Studio** (Fabric.js canvas; manual + AI **Builder**) →
exports PNG/PDF/MP4 → schedules/publishes to the (simulated) **social layer** → engagement
dashboard. **Super Admin** governs users/tenants/verification.

Key seams:
- **AI provider abstraction** (`apps/api`): one interface, three providers (Claude/OpenAI/Gemini),
  selected by config; keys from env; **deterministic stub fallback when no key is present**;
  mocked in tests.
- **Builder agent**: LLM tool-use that places canvas elements + writes copy, grounded in the
  selected catalog items.
- **Media render service** (`apps/api`): PDF (pamphlets) + **MP4** via the `demo-video`
  mechanism — ffmpeg zoompan + `drawtext` overlays + optional TTS (`say`/espeak) + captions.

## System Contracts

### Contract 1: Only approved, brand-safe content is distributable to agents
**WHY:** The product's whole value is *verified* content. An agent seeing a draft/unapproved
entry is a trust + brand-safety breach, not a cosmetic bug. (Acceptance item AC6.)

### Contract 2: No secrets or PII leave the approved boundary
**WHY:** Provider API keys and user data must never be committed, logged, or shown in the demo.
Keys come from env only.

### Contract 3: Destructive actions (delete/unpublish/overwrite) are traceable
**WHY:** Content work is iterative; authors must see who changed/removed what and recover.

### Contract 4: Runs are reproducible; AI is deterministic in tests
**WHY:** A PoC that behaves differently each run can't be reviewed. AI providers are mocked/
stubbed in tests; same inputs + config → same output.

## Enforcement Rules

Full enforcement lives in `.claude/rules/` (loaded conditionally by area):

| Rule file | Loads when you touch |
| --- | --- |
| `.claude/rules/code-review-checklist.md` | any review |
| `.claude/rules/testing.md` | test files / new logic |
| `.claude/rules/security.md` | secrets, access, external calls |
| `.claude/rules/citations.md` | any new idea/fix/suggestion (always) |
| `.claude/rules/critical-patterns.md` | always (past incidents) |

## Important Instruction Reminders

- Do what was asked; nothing more, nothing less (YAGNI).
- Prefer editing existing files to creating new ones.
- Never commit, push, or open a PR until the user explicitly approves (a `/oneshot-poc:run`
  may commit to the local `feat/content-hub-poc` branch, but never pushes).
- Search `docs/solutions/` before implementing; capture learnings after.
