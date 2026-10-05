# Requirements Charter — Walsh Content Hub (PoC)

**Date:** 2026-10-01 · **Version:** v2 — **CONFIRMED by user 2026-10-01** ("Approved, go ahead and start building")
**Source docs:** `docs/requirements/*.docx` (Content-Hub-Background, 2026_09_23 prep, 2026_09_24 discovery call)

## 1. Product summary

A **B2B Destination Content Hub** PoC. Tourism boards (Content Providers) publish a verified,
brand-safe catalog of destination content; travel trade Agents assemble that content into
marketing assets, use AI to draft social/email copy grounded in the catalog, personalize it,
and run it through a social media engagement layer. A Super Admin governs the platform.

Not consumer-facing. The distinguishing feature is **verified, destination-authorised content**
(not crowd-sourced / AI-scraped).

## 2. Roles (three) — `[explicit – feedback]`

| Role | Does |
| --- | --- |
| **Super Admin** | Manage tenants + users; approve/verify Content Providers; platform-wide oversight. |
| **Tourism Content Provider** | Build the tourism data catalog — events, places, opportunities, offers, imagery; tag by destination/market; mark brand-safe; set agent access. |
| **Tourism Agent** | Browse/search the catalog; create multi-format content in a **Canva-style Design Studio** (manual + AI "Builder" agent); personalize; schedule/publish + view engagement. |

## 3. Scope decisions (provenance-tagged)

| # | Decision | Reason | Tag |
| --- | --- | --- | --- |
| D1 | Build **both tiers end-to-end, thinner on each** (+ a thin Super Admin) | PoC shows the whole loop; depth comes later | `[explicit]` |
| D2 | Monorepo: Next.js (web) + FastAPI (api) + Postgres + MinIO; pnpm + turborepo + uv; Docker Compose | User-selected stack | `[explicit]` |
| D3 | **Pluggable AI provider**: Claude + OpenAI + Gemini behind one interface, selectable via config | User-selected | `[explicit – feedback]` |
| D4 | Default model **Claude Sonnet 4.5** (`claude-sonnet-5-5`); keys from env; **deterministic stub fallback** if no key | Keeps app runnable/demoable, tests hermetic | `[inferred]` |
| D5 | Catalog entities: **events, places, opportunities** + offers, itineraries, imagery | User + docs ("events, places, opportunities and many more") | `[explicit]` |
| D6 | **Social engagement layer = simulated** connectors (schedule/publish) + engagement dashboard on seeded metrics | Real OAuth to Meta/X/LinkedIn is out of PoC scope | `[inferred]` |
| D7 | Real assets: build **catalog/upload UI first** with seeded placeholders; user adds real entries via the app | Unblocks build; Provider role adds data through the app anyway | `[inferred]` |
| D8 | AuthN/RBAC: simple email+password (or role-switch) with real role-based route/API guards | PoC-appropriate; real IdP out of scope | `[inferred]` |
| D9 | Agent gets a **Canva-style Design Studio** with two modes: **manual** canvas editor + an AI **"Builder"** agent | User-selected | `[explicit – feedback]` |
| D10 | Canvas built on **Fabric.js** (open-source, no license key); formats = social image / story / **multi-page pamphlet** | Fastest open Canva-like surface for a PoC (alt: Polotno SDK, needs license) | `[inferred]` |
| D11 | Content types for v1: **images + pamphlets (PDF) + rudimentary video (MP4)** | User-selected; video reuses a proven mechanism (below) | `[explicit – feedback]` |
| D11a | **Video engine reuses the `demo-video` skill's mechanism** server-side: ffmpeg scene assembly from catalog images (zoompan/Ken Burns + `drawtext` overlays) + optional **TTS voiceover** (`say`/espeak) + captions → MP4. Builder can auto-script it; user can tweak scene list | ffmpeg/ffprobe/say/espeak all present on this machine; mechanism already battle-tested in the plugin | `[inferred]` |
| D12 | **Builder agent** = multi-provider LLM with tool-use that places elements + writes copy on the canvas, grounded in selected catalog items | Realises "AI-driven Canva" within the pluggable-provider abstraction | `[inferred]` |

## 4. Acceptance checklist (the contract the loop verifies)

**Auth & roles**
- [ ] AC1 — Log in as each of the 3 roles; routes/UI and API access differ by role (RBAC enforced).
- [ ] AC2 — Super Admin can list/manage users + tenants and approve a Content Provider (thin).

**Content Provider**
- [ ] AC3 — Create catalog entries of type **event / place / opportunity** (+ offer, itinerary) with title, description, destination/market tags.
- [ ] AC4 — Upload an **image** for an entry; stored in MinIO; served back in the UI.
- [ ] AC5 — Mark an entry **brand-safe** and set which agents/tenants may use it.
- [ ] AC6 — Agents only ever see **approved, brand-safe** entries (contract: no silent exposure of drafts).

**Agent — catalog + Design Studio**
- [ ] AC7 — Browse / search / filter the catalog by destination and type; select items into a **composition**.
- [ ] AC8 — Open a **Design Studio** (Fabric.js canvas) and pick a **format**: social image, story, or multi-page **pamphlet**.
- [ ] AC9 — **Manual mode**: add/move/resize/edit **text, shapes, backgrounds**, and **images pulled from the catalog**; multi-page for pamphlets.
- [ ] AC10 — **Builder (AI agent) mode**: from a prompt + selected catalog items, Builder **generates/edits the design** (places elements + writes copy) via the selectable provider; falls back to stub with no key; user can then refine manually.
- [ ] AC11 — **Personalize**: add own logo, contact details, custom offer onto the design.
- [ ] AC12 — **Export** the design: **PNG** (image) and **PDF** (pamphlet). Email-ready HTML export included.
- [ ] AC13 — **Rudimentary video (MP4)**: from selected catalog images + a scene script, the API renders a video via the **demo-video mechanism** (ffmpeg zoompan + `drawtext` overlays + optional TTS voiceover/captions). Builder can auto-generate the scene script; Agent can edit scenes/text and re-render.

**Social media engagement layer**
- [ ] AC14 — Schedule / "publish" a design/post to a (simulated) connected social account.
- [ ] AC15 — Engagement **dashboard** showing impressions/clicks/engagement for published posts (seeded/mock) (thin).

**Cross-cutting**
- [ ] AC16 — AI provider **abstraction**: one interface, 3 providers (Claude/OpenAI/Gemini), selectable, keys from env, mocked in tests. The **Builder** agent uses this abstraction.
- [ ] AC17 — `docker compose up` + documented dev commands bring the whole stack up; **seed script** loads placeholder catalog + users.
- [ ] AC18 — Tests pass: **pytest** (api) + **vitest** (web) on changed logic, plus a **Playwright** smoke of the Agent Design-Studio flow.

## 5. Out of scope (PoC)

Real social OAuth integrations · payment/subscription billing · per-tenant white-label theming (basic only) · video transcoding · production auth hardening / real email delivery · native CRM/newsletter integration (plugin stubs only) · the commercial model.

## 6. System contracts (inherited from CLAUDE.md, confirmed for this product)

1. Only **approved, brand-safe** content is distributable to agents (AC6).
2. No secrets/PII leave the approved boundary; API keys from env, never committed or shown in the demo.
3. Destructive actions (delete/unpublish) are traceable.
4. Runs are reproducible; AI is mocked/stubbed in tests for determinism.

## 7. Assumptions awaiting user override

- D4 default model, D6 simulated social, D7 assets-via-app, D8 simple auth — change any at confirmation.
- API keys available at runtime: TBD (stub fallback covers absence).
