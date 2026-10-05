# Walsh Content Hub — Requirements (Governing Spec)

> **This is the source of truth.** It is *governed* (versioned + change-controlled below) and it
> *governs* (the build loop, reviewers, and acceptance all verify against this file). Code,
> plans, and reviews conform to this document — not the other way around. The dated charter in
> `docs/plans/2026-10-01-requirements-charter.md` is the discovery/scoping record that produced
> this spec; this file supersedes it for day-to-day governance.

| | |
| --- | --- |
| **Status** | ACTIVE — confirmed 2026-10-01 |
| **Version** | 2.11.0 |
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

### Theming & workspace usability (v2.3.0) `[explicit – feedback]`

Charter: `docs/plans/2026-10-02-theming-usability-charter.md`.

- **AC30 — Light & dark themes**: the entire app (landing, auth, workspace) supports light and dark,
  driven by design tokens (CSS variables, swapped per theme). It **follows the OS preference by
  default**, a **remembered toggle** (in the sidebar / landing nav) overrides it, and there is **no
  flash** of the wrong theme on first paint. Proof: a theme test asserts both palettes exist;
  Playwright toggles the theme in the workspace, asserts the document theme attribute + the page
  background change, and that the choice persists across reload.

- **AC31 — Workspace features wired end-to-end**: the agent workspace features connect into real
  flows rather than standing alone. From the **catalog**, an agent saves an approved item into a new
  or existing **collection** without leaving the page; from **Projects** / **Templates**, an agent
  **opens a saved project** or **starts from a template** in the Design Studio (via the Studio's
  `?project=` / `?template=` routes), **saves** a composition back to Projects, and the **brand kit**
  pre-fills the Studio's Personalise panel. Empty/loading/confirmation states are handled. Proof:
  Playwright adds a catalog item to a brand-new collection (confirmation + the collection holds it),
  and saves a Studio design then re-opens it from Projects (asserting the `?project=` route loads it).

### Product-framework features (v2.5.0) `[explicit – feedback]`

Charter: `docs/plans/2026-10-03-product-framework-charter.md` (full four-set plan; built in
increments). Source: `docs/requirements/Destination_Content_Hub_Product_Framework.docx`.
Increment 1 — **Content lifecycle & validity**:

- **AC32** — **Validity & status lifecycle**: every catalog item carries a validity window
  (`valid_from` / `expires_at`) and a status in `draft → in_review → approved → expiring_soon →
  expired → withdrawn`, where `expiring_soon` and `expired` are **derived** from an injectable
  clock (not stored). The validity + derived display status serialise on the item for every role
  (FR-07/15/27/51). Proof: pytest asserts the derivation at the clock boundaries (approved →
  expiring_soon → expired) and that validity + status serialise; Playwright shows status/validity
  on a catalog item.
- **AC33** — **Auto-withdraw & propagation**: an expired or withdrawn item disappears on its own from
  the agent catalog, from search, from saved projects and from anything scheduled — without anyone
  acting — and editing a master item flags every in-use copy (FR-52/53/56). Proof: pytest asserts
  an expired item is absent from the agent catalog + search and is dropped from a saved project's
  items / scheduled posts.

Increment 2 — **Trust, approval & audit**:

- **AC34** — **Preflight check before send**: before an agent publishes or schedules, a deterministic
  check runs over the composition — every referenced item must be currently visible+valid (approved,
  brand-safe, in scope, not expired, not off-limits), the channel must be supported, and stale
  (master-edited) items are flagged. On failure it returns the **specific fixes in plain words** and
  the send is blocked (FR-42). Proof: pytest asserts a composition with an expired item fails
  preflight and publish is blocked until clean; Playwright shows the preflight message in the UI.
- **AC35** — **Send-back-with-reason**: a reviewer returns an entry to its owner with a reason; the
  entry drops to `draft` with the reason recorded and shown, and re-enters review on resubmit
  (FR-14). Proof: pytest asserts send-back sets draft + stores the reason + writes an audit row, and
  resubmit returns it to review; Playwright shows a provider sending back and the reason surfacing.
- **AC36** — **Off-limits blocklist**: a board flags a subject/place off-limits; any matching entry
  (across its title, destination, description, tags **and** structured fields) then never appears in
  the agent catalog, search or drafting — enforced at the single visibility choke-point (FR-08).
  Terms are ≥3 characters; only the term's creator or a super admin may remove it. *PoC scope: the
  blocklist is platform-wide (the one-destination PoC has a single board); per-tenant scoping is a
  backlog item.* Proof: pytest asserts a blocked term (including one hidden in a highlight) hides a
  matching entry from the agent catalog + search; Playwright shows adding a term removes it from the
  agent's view.
- **AC37** — **Audit log**: every upload, edit, approval, release, send-back and withdrawal is
  recorded (actor, action, target, time) and is readable + exportable (CSV) by authorised roles
  (FR-16, Contract 3). Proof: pytest asserts the key actions are recorded and the CSV export returns
  them; Playwright shows the admin audit view.

Increment 3 — **AI assistant & discovery** (built on **LangGraph**):

- **AC38** — **Content Assistant**: a grounded, permission-scoped assistant (a LangGraph state
  machine: route → tool → respond) that answers in plain language and only ever speaks about catalog
  content the agent may see — it cannot surface or invent anything outside the approved, current,
  in-scope library (FR-24/36). Runs via the AC16 provider abstraction: a real model when a key is
  set, the deterministic stub otherwise, so it works offline for the demo and is reproducible in
  tests. Proof: pytest asserts the reply is grounded in a visible item and never surfaces
  draft/off-limits content; Playwright shows an agent asking and getting a grounded answer.
- **AC39** — **Natural-language search**: a plain-language query resolves (type/destination hints +
  keywords) to approved, visible items through the same choke-point (FR-23). Proof: pytest asserts a
  plain query returns the right item and excludes a non-matching one.
- **AC40** — **Suggested next posts**: `GET /me/suggestions` returns current, in-scope items the
  agent hasn't used yet, timely ones first, each with a reason — no blank screen (FR-33). Proof:
  pytest asserts suggestions exclude used + hidden items; Playwright shows them on the overview.

> **Deferred to future (explicit):** real **reach / social-media integration** (connecting an
> agent's own accounts, live posting, email/messaging delivery — FR-43/45/46). Sending stays
> *simulated* as today; the product is perfected up to that boundary first.

### Sound agentic architecture (v2.8.0) `[explicit – feedback]`

Charter: `docs/plans/2026-10-04-sound-agentic-architecture-charter.md`. Evolves the assistant toward
a layered agent/tools/knowledge/validation architecture (LLM is the planner, never the source of
truth). Increment 1 — **Creative Plan IR + validation**:

- **AC41** — **Creative Plan intermediate representation**: the creative pipeline runs **Brief → Plan
  → Copy → Visual (asset selection) → Validate**, with a structured `CreativePlan` (brief, message,
  creative, copy, sources) as the contract between the agent, the generators and the validators. The
  plan is built only from the agent's selected, **visible + approved** items (tenant/permission-scoped
  via the choke-point) and composed from the approved asset library — **no generative imagery**.
  Proof: pytest asserts a plan is built from visible items + serialises the IR, and that a
  hidden/out-of-scope item is refused.
- **AC42** — **Claim-grounding validation**: every factual claim in the plan's copy must trace to an
  approved source field of a selected item; ungrounded claims are flagged (evidence gap named) and
  the plan is marked not ready — the validator, not the prompt, enforces it. Proof: pytest asserts an
  ungrounded claim (injected via a fake provider) is flagged while a grounded plan passes, with
  evidence links to the source item/field.

Increment 2 — **Knowledge domains + pgvector hybrid retrieval**:

- **AC43** — **Knowledge domains + query classifier**: retrieval routes a plain-language query to a
  knowledge domain — **product**/**asset** (the approved catalog, via the visibility choke-point),
  **brand** (the agent's own brand kit + their board), **marketing** (the agent's own activity) — a
  controlled, tenant/permission-scoped layer; auth is enforced in code, never by the model. Exposed
  at `GET /knowledge`. Proof: pytest asserts the classifier routes correctly and the product domain
  is scoped (a hidden draft never surfaces) + agent-only.
- **AC44** — **Hybrid semantic retrieval + rerank**: candidate (already-visible) items are ranked by
  a **vector + keyword blend** behind one `RetrievalBackend` interface — **pgvector** on PostgreSQL
  (real `embedding <=> query` ANN, reranked) and a **deterministic in-Python cosine** fallback on
  SQLite / in hermetic tests. Embeddings come through the AC16 gateway (deterministic offline, real
  with a model). Proof: pytest asserts the hybrid rank puts the relevant item first + embeddings are
  deterministic + the cosine backend is selected on SQLite; a Postgres-gated integration test
  exercises the real pgvector path.

Increment 3 — **Observability**:

- **AC45** — **Agent-run tracing + LangSmith**: every agentic run (assistant, creative plan,
  knowledge) records a **content-free** in-app trace (actor, kind, intent, tools, provider, latency,
  outcome — never prompts/replies/keys/PII), admin-viewable at `GET /traces`; and the LangGraph loop
  + creative plan + provider calls export to **LangSmith** when a key is configured — **off by
  default** (no key → no egress; hermetic tests + demo unaffected). Proof: pytest asserts a run is
  recorded (content-free) on an assistant/plan call, the trace view is admin-only, and LangSmith is
  off without a key; Playwright shows the admin trace view after an agent run.

Studio — **storyboard → video** (design `docs/plans/2026-10-05-studio-storyboard-design.md`):

- **AC46** — **Multi-scene storyboard**: the Design Studio is a pannable/zoomable dot-matrix
  workspace holding one **artboard per scene**, laid out in an **auto-sequential chain** with
  connector arrows. The serialisable design model carries `scenes[]` (each `{id, name, nodes,
  background?, durationMs, transition}`; a single-scene doc = a plain design, migrated from legacy
  `pages[]`). **Pure, deterministic** ops add / remove / **reorder** scenes and set per-scene
  **duration** (clamped 0.5–15 s) + **transition**; the active scene is highlighted and new content
  lands on it. Existing studio ACs (AC8/AC9/AC12/AC18) stay green. Proof: vitest asserts the scene
  ops + legacy migration are deterministic; Playwright adds/reorders scenes and edits duration +
  transition on the canvas.

- **AC47** — **Stitch scenes → video**: the editor's **Generate video** action serialises the
  ordered scenes → `POST /render/video`, which encodes each scene for its **duration** and joins
  consecutive scenes with ffmpeg **xfade** (fade/slide/zoom; `none` = hard cut; graceful hard-cut
  fallback when xfade is unavailable), overlaying a **caption** (scene text → item title) with local
  **TTS narration**. Scene images resolve to `item_id` and come **only from visible catalog
  entries** (Contract 1). Proof: pytest asserts the deterministic scene-script/xfade argv (per-scene
  durations, transition modes, offsets, caption/TTS wiring) without encoding + the fallback; vitest
  asserts the design→request serialisation; Playwright drives the editor → video.

**Priority tiers** (build order; acceptance reports honestly against all 47):
P1 core = AC1,3,4,6,7,8,9,12,16,17,18 · P2 AI-wow = AC10,11,13 · P3 surrounding = AC2,5,14,15,24 ·
design = AC19,20,21,22,23,30 · workspace = AC25,26,27,28,29,31 ·
framework = AC32,33,34,35,36,37,38,39,40 · agentic = AC41,42,43,44,45 ·
studio = AC46,47 (all prior ACs stay green).

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
| 2.3.0 | 2026-10-02 | **Theming & usability** (charter `docs/plans/2026-10-02-theming-usability-charter.md`): added **AC30** — token-driven light & dark themes across the whole app (OS default, remembered toggle, no flash); the design tokens became CSS variables. Workspace-usability wiring + polish staged for the same cycle. All prior ACs stay green. | user + Claude |
| 2.4.0 | 2026-10-02 | **Workspace usability wired** (same charter): promoted the staged item to **AC31** — agent features connected end-to-end (catalog→collection save, Projects/Templates→Studio open via `?project=`/`?template=`, Studio→Projects save, brand kit pre-fills Personalise) with handled empty/loading/confirmation states. All prior ACs stay green. | user + Claude |
| 2.5.0 | 2026-10-03 | **Product-framework features, increment 1** (charter `docs/plans/2026-10-03-product-framework-charter.md`, from the Product Framework doc's FR-01…FR-72): added **AC32–AC33** — content **validity & status lifecycle** (validity window + draft→in_review→approved→expiring_soon→expired→withdrawn, derived from an injectable clock) and **auto-withdraw & propagation** (expired/withdrawn items leave catalog, search, saved projects and schedules on their own; master edits flag in-use copies). Sets 2–4 (trust/approval, AI assistant via LangGraph, planning/resilience) follow as later increments. All prior ACs stay green. | user + Claude |
| 2.6.0 | 2026-10-03 | **Product-framework features, increment 2** (same charter): added **AC34–AC37** — **preflight check** before an agent sends (brand-safe/valid/in-scope/channel, blocks with plain-word fixes), **send-back-with-reason** approval step, **off-limits blocklist** enforced at the visibility choke-point, and a readable + CSV-exportable **audit log**. Resolves the control-vs-speed tension and Contract 3. All prior ACs stay green. | user + Claude |
| 2.7.0 | 2026-10-04 | **Product-framework features, increment 3** (same charter): added **AC38–AC40** — a **LangGraph** Content Assistant (grounded, permission-scoped: route→tool→respond), **natural-language search**, and **suggested next posts**, all via the AC16 provider abstraction (real model with a key, deterministic stub offline). Real **reach/social-media integration** explicitly deferred to future (sending stays simulated). Also added a **demo seed** (`make seed-demo`: 1 provider + 2 agents + populated workspaces). All prior ACs stay green. | user + Claude |
| 2.8.0 | 2026-10-04 | **Sound agentic architecture, increment 1** (charter `docs/plans/2026-10-04-sound-agentic-architecture-charter.md`): added **AC41–AC42** — a structured **Creative Plan IR** (Brief→Plan→Copy→Visual→Validate) as the contract between agent/generators/validators, built only from visible+approved items (asset selection, no generative imagery), and **claim-grounding validation** (every claim traces to an approved source field; the validator enforces it, not the prompt). Knowledge-domains+pgvector RAG and observability are later increments. All prior ACs stay green. | user + Claude |
| 2.9.0 | 2026-10-04 | **Sound agentic architecture, increment 2** (same charter): added **AC43–AC44** — **knowledge domains + query classifier** (product/asset/brand/marketing, tenant/permission-scoped, `GET /knowledge`) and **hybrid semantic retrieval + rerank** behind one `RetrievalBackend` (real **pgvector** on Postgres + deterministic in-Python cosine fallback for SQLite/hermetic tests; embeddings via the AC16 gateway). Observability + LangSmith is the next increment. All prior ACs stay green. | user + Claude |
| 2.10.0 | 2026-10-05 | **Sound agentic architecture, increment 3** (same charter): added **AC45** — **agent-run tracing** (content-free in-app `AgentRun` trace per assistant/plan/knowledge run, admin-viewable at `GET /traces`) + **LangSmith** export of the LangGraph loop/creative plan/provider calls, env-gated and off by default (no key → no egress; hermetic tests + demo unaffected). All prior ACs stay green. | user + Claude |
| 2.11.0 | 2026-10-05 | **Studio storyboard → video** (charter `docs/plans/2026-10-05-studio-storyboard-charter.md`, design `…-studio-storyboard-design.md`): added **AC46–AC47** — the Design Studio becomes a pannable dot-matrix **multi-scene storyboard** (model carries `scenes[]`; pure deterministic add/remove/**reorder** + per-scene **duration**/**transition**; auto-sequential connectors; legacy `pages[]` migrated) and **Generate video** stitches the ordered scenes to an MP4 via the extended `/render/video` (ffmpeg **xfade** per transition with hard-cut fallback, caption overlays + local **TTS** narration, images only from visible catalog — Contract 1). Phase 1 editor shell shipped earlier as a UX redesign (no AC); the superseded catalog-item VideoPanel was folded into the storyboard action. All prior ACs stay green. | user + Claude |
