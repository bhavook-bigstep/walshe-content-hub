# Walsh Content Hub — Requirements (Governing Spec)

> **This is the source of truth.** It is *governed* (versioned + change-controlled below) and it
> *governs* (the build loop, reviewers, and acceptance all verify against this file). Code,
> plans, and reviews conform to this document — not the other way around. The dated charter in
> `docs/plans/2026-10-01-requirements-charter.md` is the discovery/scoping record that produced
> this spec; this file supersedes it for day-to-day governance.

| | |
| --- | --- |
| **Status** | ACTIVE — confirmed 2026-10-01 |
| **Version** | 1.0.0 |
| **Owner** | vts.rise@bigsteptech.com |
| **Stage** | Proof of Concept |

## Governance (how this file changes)

1. Every requirement has a stable ID (`AC#`) and a provenance tag: `[explicit]` (user said it) ·
   `[requirement]` (source docs state it) · `[inferred]` (concluded). IDs are never reused.
2. A change to scope = edit here first, bump the version (semver: patch = wording, minor = add/soften
   a requirement, major = remove/replace one), add a **Change log** row, and get user approval.
3. The build loop reads this file as its acceptance contract; the `acceptance-reviewer` reports
   each `AC#` as **met / partial / missing** against it. A stale spec means the loop verifies the
   wrong thing — so this file leads, always.
4. Nothing ships outward (push/PR/deploy/send) without explicit user approval, regardless of status.

## 1. Vision

A **B2B Destination Content Hub**. Tourism boards (Content Providers) publish a verified,
brand-safe catalog of destination content; travel trade Agents turn that content into marketing
assets — including an **AI-driven, Canva-style studio** — and run a **social media engagement
layer**. A Super Admin governs the platform. Not consumer-facing. The differentiator is
**verified, destination-authorised** content (not crowd-sourced or AI-scraped).

## 2. Roles

| Role | Responsibility |
| --- | --- |
| **Super Admin** `[explicit]` | Manage tenants + users; approve/verify Content Providers; platform-wide oversight. |
| **Tourism Content Provider** `[explicit]` | Build the tourism data catalog — events, places, opportunities, offers, itineraries, imagery; tag by destination/market; mark brand-safe; set agent access. |
| **Tourism Agent** `[explicit]` | Browse the verified catalog; create multi-format content in a Canva-style Design Studio (manual + AI **Builder**); personalize; schedule/publish + view engagement. |

## 3. Functional requirements (the acceptance contract)

### Auth & roles
- **AC1** `[inferred]` — Log in as each of the 3 roles; routes/UI and API access differ by role (RBAC enforced).
- **AC2** `[explicit]` — Super Admin can list/manage users + tenants and approve a Content Provider.

### Content Provider — catalog
- **AC3** `[explicit]` — Create catalog entries of type **event / place / opportunity** (+ offer, itinerary) with title, description, destination/market tags.
- **AC4** `[explicit]` — Upload an **image** for an entry; stored in MinIO; served back in the UI.
- **AC5** `[explicit]` — Mark an entry **brand-safe** and set which agents/tenants may use it.
- **AC6** `[requirement]` — **CONTRACT:** Agents only ever see **approved, brand-safe** entries; drafts/unapproved content is never exposed.

### Tourism Agent — catalog + Design Studio
- **AC7** `[explicit]` — Browse / search / filter the catalog by destination and type; select items into a **composition**.
- **AC8** `[explicit]` — Open a **Design Studio** (Fabric.js canvas) and pick a **format**: social image, story, or multi-page **pamphlet**.
- **AC9** `[explicit]` — **Manual mode**: add/move/resize/edit **text, shapes, backgrounds**, and **images pulled from the catalog**; multi-page for pamphlets.
- **AC10** `[explicit]` — **Builder (AI agent) mode**: from a prompt + selected catalog items, Builder **generates/edits the design** (places elements + writes copy) via the selectable provider; falls back to stub with no key; user can refine manually.
- **AC11** `[explicit]` — **Personalize**: add own logo, contact details, custom offer onto the design.
- **AC12** `[explicit]` — **Export** the design: **PNG** (image) and **PDF** (pamphlet); email-ready HTML export included.
- **AC13** `[explicit]` — **Rudimentary video (MP4)**: from selected catalog images + a scene script, the API renders a video via the **demo-video mechanism** (ffmpeg zoompan + `drawtext` overlays + optional TTS voiceover/captions). Builder can auto-generate the scene script; Agent can edit scenes/text and re-render.

### Social media engagement layer
- **AC14** `[explicit]` — Schedule / "publish" a design/post to a (simulated) connected social account.
- **AC15** `[inferred]` — Engagement **dashboard** showing impressions/clicks/engagement for published posts (seeded/mock).

### Cross-cutting
- **AC16** `[explicit]` — AI provider **abstraction**: one interface, **three providers (Claude / OpenAI / Gemini)**, selectable via config, keys from env, **deterministic stub fallback** with no key, mocked in tests. The **Builder** agent uses this abstraction.
- **AC17** `[explicit]` — `docker compose up` + documented dev commands bring the whole stack up; a **seed script** loads placeholder catalog + users.
- **AC18** `[inferred]` — Tests pass: **pytest** (api) + **vitest** (web) on changed logic, plus a **Playwright** smoke of the Agent Design-Studio flow.

**Priority tiers** (build order; acceptance reports honestly against all 18):
P1 core = AC1,3,4,6,7,8,9,12,16,17,18 · P2 AI-wow = AC10,11,13 · P3 surrounding = AC2,5,14,15.

## 4. Non-functional / system contracts

1. Only approved, brand-safe content is distributable to agents (AC6).
2. No secrets/PII leave the approved boundary; API keys from env, never committed or shown in the demo.
3. Destructive actions (delete/unpublish/overwrite) are traceable.
4. Runs are reproducible; AI providers mocked/stubbed in tests for determinism.

## 5. Technology (governed)

Monorepo (pnpm + turborepo + uv): **Next.js 15 · TS · Tailwind** (web) · **Python 3.12 · FastAPI ·
SQLAlchemy · Alembic** (api) · **Postgres 16** · **MinIO** (assets) · **Docker Compose**.
Canvas: **Fabric.js**. Video/TTS: **ffmpeg** + `say`/espeak. Default AI model: `claude-sonnet-5-5`.

## 6. Out of scope (PoC)

Real social OAuth integrations · payment/subscription billing · per-tenant white-label theming
(basic only) · full video editing (rudimentary render only) · production auth hardening / real
email delivery · native CRM/newsletter integration (plugin stubs only) · the commercial model.

## 7. Change log

| Version | Date | Change | By |
| --- | --- | --- | --- |
| 1.0.0 | 2026-10-01 | Initial governing spec, promoted from charter v2 (confirmed). | user + Claude |
