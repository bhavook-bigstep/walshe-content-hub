# Walsh Content Hub — Requirements (Governing Spec)

> **This is the source of truth.** It is *governed* (versioned + change-controlled below) and it
> *governs* (the build loop, reviewers, and acceptance all verify against this file). Code,
> plans, and reviews conform to this document — not the other way around. The dated charter in
> `docs/plans/2026-10-01-requirements-charter.md` is the discovery/scoping record that produced
> this spec; this file supersedes it for day-to-day governance.

| | |
| --- | --- |
| **Status** | ACTIVE — confirmed 2026-10-01 |
| **Version** | 2.22.0 |
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
- **AC6** `[requirement]` — **CONTRACT:** Agents only ever see content a provider has deliberately published. **Re-based by AC54 (deliberate, user-approved contract change; supersedes the AC49 catalog-level rebase):** distribution of an entry **in a catalog** is gated **per entry** — each entry is **draft** (hidden from all agents; the default), **public** (every agent), or **private** (only agents **invited** on its catalog, `shared_agent_ids`). Choosing public/private *is* the act of publishing; an entry's draft/approved **status**, **brand_safe** flag, and the pre-AC49 per-entry access scope (**AC37** `allowed_tenant/agent_ids`) **no longer gate catalog entries**. The legacy per-entry approved + brand-safe + scope gate still applies to **catalog-less** (pre-catalog) entries, so AC32–37 stay green there. Expiry (AC32/33) + off-limits (AC36) always apply to every entry.

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
  machine-crawlable. Plus **team members** (invite colleagues into the org) and a
  **content-performance** view (how agents use the content). The structured `attributes`/
  `templates`/`media` data + endpoints remain; **as of the AC49 catalog rework the provider authors
  content as Catalog → Entry → first-class Items** (text + media) in the single Catalog UI — the
  standalone structured-inventory form + Media-library screen are retired (their APIs stay). Proof:
  pytest covers structured create/edit + templates schema + media/team/performance (provider-only);
  Playwright covers creating an entry and adding a text item.

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
- **AC33** — **Auto-withdraw & propagation**: an expired or withdrawn item drops on its own from
  everything that *uses* it — saved projects, schedules, the builder, and suggestions — without
  anyone acting, and editing a master item flags every in-use copy (FR-52/53/56). **Amended by
  AC55:** an expired item is no longer *hidden* from the agent catalog/search — it is shown
  **greyed and unusable** there — but it is still dropped from every usage path. Proof: pytest
  asserts an expired item is dropped from a saved project's items / scheduled posts and the build
  path (with AC55 covering the greyed-but-shown catalog behavior).

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

- **AC48** — **Studio interaction & theming fixes**: the full-bleed canvas **pans by left-dragging
  empty space** (plus space/middle-drag) and the **wheel zooms to the cursor** (mouse + trackpad);
  the zoom/fit control sits clear of the bottom-right assistant button; selected-item text is
  **readable in light theme** (theme-aware tokens, not light-on-light); the dot-matrix spacing is
  **floored** so a zoomed-out view isn't clouded; and entities can be **selected, moved, resized,
  and deleted** on the canvas. First increment of the entity-model epic (charter
  `docs/plans/2026-10-05-entity-model-charter.md`). Proof: a studio-interaction e2e (drag pans,
  wheel zooms, zoom clears the assistant, select+Delete removes an entity) + a `deleteNode` unit
  test; existing studio/storyboard ACs stay green.

Catalog library (charter `docs/plans/2026-10-05-catalog-library-charter.md`):

- **AC49** — **Catalog as the container + invited agents (superseded as the gate by AC54).** A
  provider has **one catalog** (created on first use; `GET /catalogs/mine`) that holds the entries
  and an **invited-agents** list (`shared_agent_ids`). Agent visibility is decided **per entry** by
  AC54 (draft/public/private), not by a catalog-wide flag — the single Contract-1 gate lives in
  `services/visibility`; per-entry approval remains only for legacy catalog-less entries. A
  deterministic, idempotent migration moves catalog-less entries into a provider catalog (carrying
  approved+brand-safe over to public). The provider authors content as **Catalog → Entry → Item**
  (the single Catalog section; the old Catalog-library / My-catalog / New-entry / Media-library
  screens + the client-side store are retired). Proof: pytest (per-entry gating; CRUD + invite;
  migration) + a provider-UI e2e.

- **AC50** — **Entries decompose into first-class items (text + media, incl. video).** An `Item`
  (`kind: text|image|video`, ordered) is one text block or one media file of an entry. Providers add
  text items and upload **image + video** media items (type validated; active-markup types refused).
  A **catalog-gated browse API** (`GET /catalogs/{id}/entries`) returns a catalog's entries + items
  for the studio; a deterministic migration decomposes an entry's title/description/sections + assets
  into items. Proof: pytest (item CRUD; video accepted + bad type refused; browse gating; serving;
  migration).

- **AC51** — **Per-user media storage (Local + Agent).** Every user has their own storage (their
  `users/<id>/` prefix) holding a `UserAsset` tagged by **source** — `local` (uploaded) or `agent`
  (AI-generated) — and **kind**; these surface in the studio as the **Local** and **Agent** picker
  sections (alongside **Catalog**). Upload image/video/text → local; **generate image + text** →
  agent (deterministic stub offline; no generated video/animation — that is sprites); list by
  source; owner-scoped serving. Proof: pytest (upload/text/generate; list by source; deterministic
  generation; another user cannot read your assets).

- **AC52** — **Entry cover photo (uploaded or AI-generated).** Each entry carries a **cover photo**
  (`cover_object_key`) used as its card image across the provider + agent catalogs. A provider sets
  it from the New-entry form (and the entry page) either by **uploading** a raster image (type
  validated; active-markup types refused) or by **AI-generating** it from a prompt. Image generation
  runs through a single config-selected seam (`AI_IMAGE_PROVIDER` / `AI_IMAGE_MODEL`, default
  **Gemini 2.5 Flash Image — `gemini-2.5-flash-image`, aka "nano-banana"**) that falls back to a
  **deterministic solid-colour stub** when no key is
  set — no egress, hermetic tests (Contract 2/4); the agent media-library generate path uses the same
  seam. The cover is served through the one asset gate, so it is visible only where its entry is.
  Proof: pytest (image seam: stub determinism, mocked Gemini, failure fallback; cover upload/generate
  set the key, served to a visible agent, hidden from an unshared agent, bad type + ownership guarded).

- **AC53** — **Structured location + fixed season (catalog filters).** Each entry carries a
  structured **country / state / city** (chosen in the New-entry form from cascading dropdowns fed
  by a curated backend hierarchy, `GET /catalog/geo`) and an optional **season** from a fixed closed
  list (spring/summer/autumn/winter/year-round). The free-text `destination` label is kept (auto-
  composed from the location). The agent catalog filters by `country`, `state`, `city`, and `season`
  (cascading dropdowns), in the single `agent_visible_entries` choke-point. Proof: pytest (geo
  reference endpoint; entry stores location+season; agent filters by each; invalid season rejected).

- **AC54** — **Per-entry visibility: Draft · Public · Private (re-bases the Contract-1 gate again).**
  Within a catalog, each entry sits in one of three sets: **draft** (the default for a new entry;
  visible to no agent), **public** (visible to every agent), or **private** (visible only to the
  agents **invited** on the catalog — `shared_agent_ids`). This per-entry setting — not a catalog-
  wide flag — is the single Contract-1 gate for catalog entries, applied in `is_visible_to_agent`;
  expiry (AC32/33) and the off-limits list (AC36) still always apply, and catalog-less legacy
  entries keep the approved+brand-safe fallback. The provider chooses the set when creating an entry
  and can move it later (New-entry dialog + the entry's Review panel); pulling an entry out of a
  distributed set (→ draft) is a traceable unpublish (Contract 3). A catalog with nothing visible to
  an agent looks like missing (404). Proof: pytest (default draft hidden; public reaches all; private
  only invited; set_access moves sets + audits unpublish; catalog gating) + a provider-UI e2e.

- **AC55** — **Expiry-only lifecycle; expired shown greyed, not hidden.** An entry's only lifecycle
  control is its **expiry date** (no separate "valid from"): past it, the entry reads **expired**
  (and **expiring_soon** within the window) regardless of approval status; with no expiry it lives
  forever. On creation the provider either leaves it **Never expires** or sets an expiry date, and
  for an **event** may set the expiry to the type's **end date** in one click. Expired entries are
  **still shown** in both the provider and agent catalogs, **greyed out** (de-rated by
  `display_status`), but are **not usable** — an agent can't add them to a composition, they're
  dropped from the build/schedule/suggestion paths, and the pre-send check still blocks them.
  (Deliberate, user-approved change to AC32/33: expired is surfaced-but-greyed instead of hidden
  from agents.) Proof: pytest (display derivation; expired shown + marked but excluded from use;
  expired in a public catalog is greyed).

- **AC56** — **Entry provenance (creator + org).** Every entry records **who created it**
  (`created_by_email`) and **which organization it belongs to** (`org_name`, empty when the creator
  has none), snapshotted at creation and shown on the entry. Proof: pytest (creator + org captured
  and persisted).

- **AC57** — **Chat assistant for providers too (grounded in their own catalog).** The grounded chat
  assistant (AC38) is available to **content providers** as well as agents — a provider's assistant
  is grounded in **their own catalog** (`visibility.entries_for_actor`: all of the provider's
  entries, including drafts agents can't see), never another org's content. `/me/suggestions` +
  `/knowledge` stay agent-only. This is the first of further provider agentic features. Proof:
  pytest (a provider may call `/assistant`, grounded in their own draft entry; admins still 403).

- **AC58** — **Organization logo upload.** A provider uploads the org logo (**jpg/jpeg/png**, no
  SVG) rather than pasting a URL; it is stored and served through the one asset gate (readable by any
  authenticated user, since a logo isn't sensitive), and `logo_url` points at the served asset. The
  org page shows the uploaded logo. Proof: pytest (upload sets a served `logo_url`; SVG refused;
  agents can't upload).

- **AC59** — **Catalog is a search/query library; save references to collections.** The agent catalog
  is browse/search-first (keyword + location + season + type); each card's primary action is **Save
  to collection**, which stores a **validated entry reference** (the API rejects an entry not visible
  to the agent — expired/hidden/deleted). The old dead-ended "Add to composition" is removed.
  (redesigned UI.) Proof: pytest (save/add/remove + reject invalid) + a save-to-collection e2e.
- **AC60** — **Collections resolve + manage.** A collection stores references and **resolves against
  the live catalog** (stale/expired refs dropped; counts reflect resolved items). A **detail view**
  shows the saved entries' media, lets the agent **remove** items and **rename**, and **Open in
  Design Studio** (starts a project). (redesigned UI.) Proof: pytest (resolve drops an expired ref) +
  a collection-detail e2e.
- **AC61** — **Entry detail modal (all info).** Clicking an entry — in the Catalog or inside a
  Collection — opens a read-only modal showing **all of the entry's information**: its structured
  type details, season, validity (valid-from / expiry), markets, highlights, custom sections,
  provenance (provider + org), and its items (text/image/video). Proof: e2e.
- **AC62** — **Templates: Preview + Use on hover.** A template card reveals **Preview** (opens a
  preview) and **Use** (opens it in the studio) on hover, instead of opening on click. Proof: e2e.
- **AC63** — **Studio project from a collection; scoped media.** A **new project is started from a
  collection** (from the collection detail); the studio's usable media is the **project's collection
  items + the agent's Local uploads + AI-generated** media (via `/me/library`) — the whole catalog is
  no longer loaded. Proof: e2e (collection → Open in Design Studio → `?project=`).
- **AC64** — **Structured Workspace (single studio input + autosave).** A project stores one
  **structured workspace** — `{metadata, reference_content:{collections,uploads,generated}, scenes}`
  — where `reference_content` holds **references only** (entry ids + asset object_keys + labels),
  never media copies. `GET /me/projects/{id}/workspace` returns it **resolved** (collections'
  entries with their items; uploads/generated with object_keys); `PUT /me/projects/{id}/workspace`
  **autosaves the whole object**, validating references (visible entries, owned assets), dropping
  stale ones, and bumping `metadata.version`. Creating a project **from a collection** seeds
  `reference_content.collections`; an old project with no workspace **migrates on read** from its
  `item_ids`/`design`. The Design Studio reads the resolved workspace as its single input (builder
  grounding + placeable media) and autosaves it; `item_ids`/`design` stay a derived/compat view.
  Agent-only, ownership-scoped. Proof: api (seed-from-collection, PUT validation + version bump,
  legacy migration).

**Priority tiers** (build order; acceptance reports honestly against all 64):
P1 core = AC1,3,4,6,7,8,9,12,16,17,18 · P2 AI-wow = AC10,11,13 · P3 surrounding = AC2,5,14,15,24 ·
design = AC19,20,21,22,23,30 · workspace = AC25,26,27,28,29,31 ·
framework = AC32,33,34,35,36,37,38,39,40 · agentic = AC41,42,43,44,45 ·
studio = AC46,47,48 · catalog = AC49,50,51,52,53,54,55,56 · provider = AC57,58 ·
agent-workspace = AC59,60,61,62,63 · workspace-engine = AC64 (all prior stay green).

## 4. Non-functional / system contracts

1. Only content a provider deliberately publishes is distributable to agents — enforced at the
   **catalog** level (public / privately-shared) under the catalog library (AC6 re-based by AC49);
   per-entry approval remains the gate only for legacy catalog-less entries.
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
| 2.22.0 | 2026-10-06 | **Structured Workspace (single studio input + autosave)** (`/oneshot-poc:run`, charter `docs/plans/2026-10-06-ai-builder-optimize-charter.md` v2.0): added **AC64** — a project stores one structured **workspace** `{metadata, reference_content:{collections,uploads,generated}, scenes}` holding **references only**; `GET /me/projects/{id}/workspace` returns it resolved, `PUT` autosaves the whole object (validates visible-entry/owned-asset references, drops stale, bumps `metadata.version`); creating a project from a collection seeds `reference_content.collections`; old projects migrate on read; the Design Studio reads the resolved workspace as its single input (builder grounding + placeable media) and autosaves it; `item_ids`/`design` kept as a derived/compat view. All prior ACs stay green. | user + Claude |
| 2.21.0 | 2026-10-06 | **Agent workspace: Catalog + Collections (accurate + redesigned)** (`/oneshot-poc:run`, charter `docs/plans/2026-10-06-agent-workspace-charter.md`): added **AC59** (catalog = search/query library; primary action **Save to collection** as a validated reference; removed the dead "Add to composition"), **AC60** (collections **resolve** against the live catalog + a detail view: see items, remove, rename, Open in Design Studio), **AC61** (clicking an entry opens an item-detail modal, in catalog + collections), **AC62** (templates **Preview + Use on hover**), **AC63** (a studio **project starts from a collection**; usable media = collection items + Local uploads + AI library, not the whole catalog). Reordered the agent sidebar. Redesigned both pages within the design system. All prior ACs stay green. | user + Claude |
| 2.20.0 | 2026-10-06 | **Provider assistant + org logo upload + UX cleanup** (⏸G feedback): added **AC57** — the grounded chat assistant now serves **providers** (grounded in their own catalog via `entries_for_actor`); and **AC58** — **org logo upload** (jpg/jpeg/png) replacing the URL field, served through the asset gate. Also: the entry **Edit** now uses the same form as create (edits everything — type/visibility/location/season/attributes/expiry) via a shared `EntryForm`; form sections (location/details/cover/expiry) **collapse by default** for a cleaner form; **Team** + **Invite agents** moved into the **Organization** page (removed Team from the sidebar and Invite from the Catalog); **Off-limits** removed from the provider sidebar (backend + route retained for now). All prior ACs stay green. | user + Claude |
| 2.19.0 | 2026-10-06 | **Expiry-only lifecycle (greyed, not hidden) + entry provenance** (⏸G feedback): added **AC55** — an entry's only lifecycle control is its expiry date (New-entry UX: "Never expires", or a date, or one-click "use event end date"; dropped the separate valid-from field). Expired entries now show **greyed** in both provider + agent catalogs but are **not usable** (can't add to a composition; dropped from build/schedule/suggestions; pre-send still blocks). This amends AC32/33 (expired surfaced-but-greyed instead of hidden); `display_status` now derives expiry for any non-withdrawn status. Added **AC56** — each entry snapshots its creator (`created_by_email`) + org (`org_name`, empty when none), shown on the entry page. All prior ACs stay green. | user + Claude |
| 2.18.2 | 2026-10-05 | **Entry edit/delete + invite-in-a-dialog** (⏸G feedback): the entry page gained **Edit** (title + cascading location + season via `PUT /catalog/{id}`) and **Delete** (confirm dialog → audited `DELETE /catalog/{id}` → back to the catalog) controls; a new self-contained edit/delete e2e (AC29). The invite-agents UI moved from an inline card into a **dialog** opened by an "Invite agents" button on the catalog page. No contract change. | user + Claude |
| 2.18.1 | 2026-10-05 | **LLM/image provider verification + fixes** (⏸G feedback: "check the LLM path"): live-smoked the AI providers with the user's keys. Gemini works (`gemini-2.5-flash` for LLM, `gemini-2.5-flash-image` for images); the OpenAI key returned 401 (invalid/revoked). Corrected the invalid default image model (`nano-banana-2` → `gemini-2.5-flash-image`) in config + `.env.example` + AC52 wording, and pointed the local `.env` LLM at the working Gemini config. Also (same pass) added **invite-agents-by-email** UI + API (`/catalogs/mine/invite`), split the provider catalog into **Public/Private/Drafts** sections, and replaced native `<select>`s with a custom accessible dropdown (`components/ui/Select`) across the catalog/agent forms. No contract change. | user + Claude |
| 2.18.0 | 2026-10-05 | **Per-entry visibility (Draft/Public/Private)** (⏸G feedback): added **AC54** — each catalog entry is independently Draft (default, hidden), Public (every agent), or Private (only agents invited on the catalog). This **re-bases the Contract-1 gate from catalog-level (AC49) to per-entry** in `is_visible_to_agent`; the catalog becomes a container holding the invited-agents list, and its own public/private toggle is retired from the UI. Provider sets the set at creation + on the entry's Review panel; → draft is a traceable unpublish; a catalog with nothing visible is 404. The legacy catalog→catalog migration now carries approved+brand-safe over to public. Reworked the catalog-gating/items tests + the catalog e2e to the per-entry model; seed marks the demo entries public (one private + the demo agent invited). All prior ACs stay green. | user + Claude |
| 2.17.0 | 2026-10-05 | **Structured location + fixed season filters** (⏸G feedback): added **AC53** — entries carry structured **country/state/city** (New-entry cascading dropdowns from a curated backend hierarchy `GET /catalog/geo`) + an optional **season** from a fixed list; the agent catalog filters by country/state/city/season. Kept `destination` as an auto-composed label. Dropped the free-text `best_season` template field. Also fixed the New-entry dialog to a fixed height within the viewport with the form body scrolling internally. All prior ACs stay green. | user + Claude |
| 2.16.0 | 2026-10-05 | **Entry cover photo + configurable image model** (⏸G feedback): added **AC52** — each entry has a **cover photo** (`cover_object_key`), set from the New-entry form (and entry page) by **upload** or **AI-generate**, shown as the card image across provider + agent catalogs. Added a config-selected image-generation seam (`AI_IMAGE_PROVIDER`/`AI_IMAGE_MODEL`, default **Gemini `nano-banana-2`**) with a deterministic stub fallback when no key is set; the agent media-library generate path now uses the same seam. Also (same pass) the New-entry/entry forms now render the **per-type structured fields** from the backend `/catalog/templates` (AC29) instead of a flat form. All prior ACs stay green. | user + Claude |
| 2.15.0 | 2026-10-05 | **Provider catalog UI rework** (entity-model epic, Increment 2c; ⏸G feedback): the provider screens were still backed by a client-side localStorage store, created entries with no catalog, and showed none of the item model. Reworked to a single API-backed **Catalog** section (per the user: **one catalog per provider**, `GET /catalogs/mine`): catalog publish/share + entries (New-entry dialog: type/title/destination/dates) + entry **items** (text/media, Add-item dialog). Retired the Catalog-library / My-catalog / New-entry / Media-library screens + the `provider-store`; amended **AC49** (one catalog) and **AC29** (item-based authoring; structured/media APIs retained). Reworked the inventory/trust/catalog e2e to the new flow. All ACs stay green. | user + Claude |
| 2.14.0 | 2026-10-05 | **Catalog library, phase 2** (entity-model epic, Increment 2b; same charter): added **AC50** — entries decompose into first-class **items** (`Item`: text / image / video, ordered), with provider item CRUD + image/video upload (validated), a catalog-gated browse API (`GET /catalogs/{id}/entries`), generalized media serving across catalog assets/items + personal assets, and a deterministic entry→items migration — and **AC51** — **per-user media storage** (`UserAsset` by **source** local/agent + kind) in each user's own storage: upload image/video/text (Local), **generate image+text** (Agent, deterministic stub; animation = sprites), list by source, owner-scoped. The studio media picker's three sections (Catalog · Local · Agent) are defined by origin. All prior ACs stay green. | user + Claude |
| 2.13.0 | 2026-10-05 | **Catalog library, phase 1** (entity-model epic, Increment 2a; charter `docs/plans/2026-10-05-catalog-library-charter.md`): added **AC49** — a provider **catalog library** (Catalog model: name/category/public-private + agent sharing) that **re-bases Contract 1 / AC6** to catalog-level gating (public or privately-shared) in the single `services/visibility` choke-point; per-entry approval remains only for legacy catalog-less entries. Provider CRUD + share API + a "Catalog library" UI; deterministic idempotent migration of catalog-less entries into per-provider catalogs. Entries→items + uploads (AC50–51) follow in phase 2b. All prior ACs stay green. | user + Claude |
| 2.12.0 | 2026-10-05 | **Studio interaction & theming fixes** (entity-model epic, Increment 1; charter `docs/plans/2026-10-05-entity-model-charter.md`): added **AC48** — left-drag pan + wheel-zoom-to-cursor on the full-bleed canvas, zoom control moved clear of the assistant FAB, light-theme selected-text contrast fixed (a dark-on-dark `bg-walshe-mint text-walshe-teal` active state), dot-matrix spacing floored for zoomed-out views, and entity select/move/resize/**delete** on the canvas. Fixes a pointer-events bug where the closed storyboard drawer swallowed canvas pan/zoom. Increments 2–4 (catalog re-model + uploads, declarative entity model + media picker, entity-aware animation/video/sprite render) follow. All prior ACs stay green. | user + Claude |
| 2.11.0 | 2026-10-05 | **Studio storyboard → video** (charter `docs/plans/2026-10-05-studio-storyboard-charter.md`, design `…-studio-storyboard-design.md`): added **AC46–AC47** — the Design Studio becomes a pannable dot-matrix **multi-scene storyboard** (model carries `scenes[]`; pure deterministic add/remove/**reorder** + per-scene **duration**/**transition**; auto-sequential connectors; legacy `pages[]` migrated) and **Generate video** stitches the ordered scenes to an MP4 via the extended `/render/video` (ffmpeg **xfade** per transition with hard-cut fallback, caption overlays + local **TTS** narration, images only from visible catalog — Contract 1). Phase 1 editor shell shipped earlier as a UX redesign (no AC); the superseded catalog-item VideoPanel was folded into the storyboard action. All prior ACs stay green. | user + Claude |
