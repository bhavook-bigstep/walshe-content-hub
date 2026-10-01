# CLAUDE.md

Guidance for Claude Code working in this repository. **This file says WHY. Rules say WHAT.
Guides say HOW.** They never swap roles.

## Project

> ⚠️ This repo was scaffolded empty — the values below are best-guesses from the project name.
> Correct anything marked `⚠️ CONFIRM` before the first real build.

| Property | Value |
| --- | --- |
| Project | Walsh Content Hub — a central hub for creating, organising, and publishing content `⚠️ CONFIRM` |
| Stage | Proof of concept |
| Language / stack | `⚠️ CONFIRM` — not yet chosen (suggest: TypeScript · Next.js · Postgres, or Python · FastAPI) |
| Test runner | `⚠️ CONFIRM` — (suggest: Vitest/Jest for JS, pytest for Python) |
| Source of truth | `⚠️ CONFIRM` — where the authoritative content/config lives (e.g. the database / a CMS) |

## Compound Engineering

This repo follows the compound loop: **BRAINSTORM → PLAN → IMPLEMENT → REVIEW → COMPOUND**.
Each unit of work should make the next one easier. Before implementing, search
`docs/solutions/` for prior learnings; after solving something non-trivial, capture it with
`/oneshot-poc:compound`. See `AGENTS.md` for the workflow and approval gates.

## Architecture

`⚠️ CONFIRM` — no code exists yet. Once the stack is chosen, keep a short map here: the main
components (e.g. content editor UI, API layer, storage, publishing/export pipeline) and how
data flows between them. This is the top of the loading order — everything inherits from it.

## System Contracts

The invariants that must never be violated — where a breach is a bug of record, not a style
nit. These are starting defaults for a content hub; adjust to the real design.

### Contract 1: Published content is the source of truth; drafts never publish silently
**WHY:** Readers must only ever see content an author explicitly published. An accidental
publish of a draft is a trust/accuracy incident, not a cosmetic bug.

### Contract 2: No secrets or user PII leave the approved boundary
**WHY:** Content systems hold author accounts, API keys for publishing targets, and sometimes
reader data. A leak is a security incident with legal and reputational cost.

### Contract 3: Every destructive action (delete/overwrite/publish) is traceable
**WHY:** Content work is iterative; authors must be able to see who changed or removed what,
and recover from mistakes. Untraceable mutation makes data loss unrecoverable.

### Contract 4: Runs/builds are reproducible — pinned inputs + versioned config
**WHY:** A PoC that behaves differently each run can't be reviewed or trusted. Same inputs +
config → same output.

> ⚠️ CONFIRM these contracts reflect what Walsh Content Hub actually is — replace any that
> don't fit once the domain is nailed down.

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
- Never commit, push, or open a PR until the user explicitly approves.
- Search `docs/solutions/` before implementing; capture learnings after.
