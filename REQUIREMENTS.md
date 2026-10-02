# Walsh Content Hub — Requirements (Governing Spec)

> **This is the source of truth.** It is *governed* (versioned + change-controlled below) and it
> *governs* (the build loop, reviewers, and acceptance all verify against this file). Code,
> plans, and reviews conform to this document — not the other way around. The dated charter in
> `docs/plans/2026-10-01-requirements-charter.md` is the discovery/scoping record that produced
> this spec; this file supersedes it for day-to-day governance.

| | |
| --- | --- |
| **Status** | ACTIVE — confirmed 2026-10-01 |
| **Version** | 2.2.0 |
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

A **B2B Destination Content & Growth Hub**, built to showcase that we can deliver an
ElevateTourism-class product **in The Walshe Group's design language**. Tourism boards (Content
Providers) publish a verified, brand-safe catalog of destination content; travel trade Agents turn
that content into marketing assets — including an **AI-driven, Canva-style studio** — and run a
**social media engagement layer**. A Super Admin governs the platform. Not consumer-facing. The
differentiator is **verified, destination-authorised** content (not crowd-sourced or AI-scraped).

**The feature set is grounded in the Walshe Group discovery meetings** (`docs/requirements/*.docx`):
the curated verified content hub, à-la-carte comms assembly ("promote Africa to New Zealanders" →
pull itineraries/images/offers/airline deals), AI that drafts a first version the agent edits,
the two content tiers (board/head-office vs. trade agents), agent personalization (logo/contact/
offers), seasonal/moment marketing, and the social engagement layer. **ElevateTourism** is the
reference for product polish and UX patterns; **The Walshe Group** (walshegroup.com) is the
authoritative source for the visual design language — colour, typography, logo, premium B2B
travel/aviation tone ("Premium brands, trusted outcomes"; 50 years in 2026).

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

### Design & Experience (v2.0.0 — the Walshe design overhaul) `[explicit – feedback]`

The product must *look like a premium product*, in The Walshe Group's design language — not a
generic/plain default. Anchored to walshegroup.com (exact tokens), ElevateTourism for UX patterns.

- **AC19** — **Walshe design system**: brand tokens (colour palette, typography, spacing, radius)
  extracted from walshegroup.com, defined once in a central theme (Tailwind config / CSS vars) and
  applied app-wide. Proof: a test asserts the theme exposes the Walshe brand tokens.
- **AC20** — **Branded public landing page** at `/`: a premium hero in the Walshe language, value
  props drawn from the discovery features (verified content hub · AI-assembled comms · trade
  personalization · social engagement), and a clear CTA into sign-in. Proof: Playwright asserts the
  hero headline + primary CTA render on `/`.
- **AC21** — **Branded app shell**: a persistent, role-aware header/nav carrying the Walshe logo and
  a consistent layout across every authenticated screen. Proof: Playwright asserts the branded nav +
  logo are present after login for each role.
- **AC22** — **Polished role dashboards**: each role lands on a designed home with real data-viz
  (stat/scorecard tiles, at least one chart) and designed cards — not bare tables. Proof: Playwright
  asserts the dashboard stat tiles + chart render for the agent.
- **AC23** — **Responsive + states**: usable at mobile width (no horizontal overflow; nav adapts)
  and real empty/loading states on data screens. Proof: Playwright at a mobile viewport asserts no
  horizontal scroll on the landing + agent dashboard.

> **Visual-quality bar (critic-gated, not matrixed):** the `ui-reviewer` scores the key screens
> against the Walshe design brief (`docs/design/ui-brief.md`) each design round and must PASS, and
> the user confirms the look at ⏸ G. This is the subjective bar AC19–AC23 can't fully encode.

### Access & Accounts (v2.1.0 — registration) `[explicit – feedback]`

The three roles must be creatable through the product (not only via the seed), using a **hybrid**
provisioning model that fits the verified-content trust boundary.

- **AC24** — **Account provisioning (hybrid)**: (a) **Tourism Agents self-register** on a public
  `/register` page (email + password) and are signed in on success; (b) the **Super Admin provisions
  Content Providers** (and may add agents) from the admin console, naming the provider's
  organization (tenant) — new providers start **unapproved** until verified (AC2); (c) **role
  escalation is prevented** — self-registration can only create a Tourism Agent, and admin
  user-creation cannot mint a Super Admin; the first Super Admin stays seeded. The API enforces all
  of this authoritatively. Proof: pytest covers self-register (agent, duplicate-email, weak
  password) and admin create-user (provider+org unapproved, non-admin forbidden, super_admin role
  rejected); Playwright covers the public register → agent-home flow.

### Profiles, dual workspaces & role-based registration (v2.2.0) `[explicit – feedback]`

Charter: `docs/plans/2026-10-02-requirements-charter.md`. The signed-in experience becomes a
proper, character-rich **workspace per role**, entered through a role-aware registration flow.

- **AC25** — **Role-based registration & provider queue**: `/register` opens with a **role choice**.
  A **Tourism Agent** is created and signed in immediately. A **Content Provider** self-registers
  (email, password, organization, contact) into a **pending** state and sees an "application under
  review — our team will contact you" **holding screen** with no workspace access until a **Super
  Admin approves**; approval unlocks the provider workspace. API-enforced; no role escalation
  (self-register can't mint an admin, a provider can't self-approve).
- **AC26** — **Fixed-viewport workspace**: every signed-in screen fits the viewport with **no
  document scroll** — content that must scroll is bounded inside its own region and scrolls there,
  so everything is visible at a glance or behind a menu/dialog. No page overflow (height or width)
  at desktop or mobile, both roles.
- **AC27** — **Rich profiles**: a profile/settings page (display name, avatar, bio, preferences)
  reached from a top-bar profile menu; the workspace greets by name and shows the avatar; Content
  Providers have an **organization page** (logo, blurb, markets served, verification badge).
- **AC29** — **Provider structured inventory**: the catalog is a structured tourism **inventory** —
  each content type declares typed template fields (a **self-describing schema** at
  `GET /catalog/templates` for AI agents), entries carry those typed `attributes` + `highlights`,
  and **custom sections** capture anything outside the template, so the inventory stays rich *and*
  machine-crawlable. Plus a **media library** (all the provider's assets), **team members** (invite
  colleagues into the org), and a **content-performance** view (how agents use the content). Proof:
  pytest covers structured create/edit + templates schema + media/team/performance (provider-only);
  Playwright covers building a structured entry with a custom section.

- **AC28** — **Agent workspace features**: **Saved projects** (persist/reopen Design Studio
  compositions — a named composition with its canvas design), **Collections** (group catalog items
  for reuse), **Brand kit** (logo, colours and contact stored once and reused when personalising),
  and **Templates** (start a design from a preset). Each is agent-owned and persisted. Proof:
  pytest covers projects + collections CRUD, brand kit round-trip and the templates list
  (agent-only); Playwright covers creating a collection.

**Priority tiers** (build order; acceptance reports honestly against all 29):
P1 core = AC1,3,4,6,7,8,9,12,16,17,18 · P2 AI-wow = AC10,11,13 · P3 surrounding = AC2,5,14,15,24 ·
design = AC19,20,21,22,23 · workspace = AC25,26,27,28,29 (all prior ACs stay green).

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
| 2.0.0 | 2026-10-01 | **Design overhaul** at ⏸ G: reframed as a Walshe-branded ElevateTourism-class product; added Design & Experience acceptance items **AC19–AC23** (Walshe design system, landing page, app shell, dashboards, responsive) + a critic-gated visual-quality bar. Functional AC1–18 unchanged and must stay green. Anchor = walshegroup.com; UX reference = elevatetourism.com; features grounded in `docs/requirements/`. | user + Claude |
| 2.1.0 | 2026-10-02 | **Account provisioning**: added **AC24** (hybrid registration) — public agent self-register, Super-Admin-provisioned providers with org/tenant + approval, role-escalation prevented. Enables creating the three roles through the product rather than only the seed. All prior ACs stay green. | user + Claude |
| 2.2.0 | 2026-10-02 | **Profiles & dual workspaces** (charter `docs/plans/2026-10-02-requirements-charter.md`): added **AC25–AC29** — role-based registration + provider queue/holding; fixed-viewport workspace; rich profiles + provider org page; agent features (saved projects, collections, brand kit, templates); provider structured AI-crawlable inventory (custom sections, media library, team, performance). Built in phases; all prior ACs stay green. | user + Claude |
