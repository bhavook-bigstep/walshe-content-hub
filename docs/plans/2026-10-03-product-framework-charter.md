# Requirements Charter — Product Framework features (round 3)

**Date:** 2026-10-03 · **Charter version:** 1.0 · **Governs:** AC32–AC44 in `/REQUIREMENTS.md`
(added to the spec **incrementally**, one feature set per increment, as each is built).

**Source:** `docs/requirements/Destination_Content_Hub_Product_Framework.docx` (Walshe Group
Destination Content Hub, Product Framework v1.0 — 72 functional requirements FR‑01…FR‑72).

This round takes the next, highest‑value slice of that framework beyond the PoC's current
AC1–AC31. It is **not** an attempt to build all 72 FRs (that would be far beyond a PoC); the four
feature sets below were curated for impact + feasibility on the existing architecture and
confirmed by the user at the ⏸ A2 scope gate.

## A2 — Scope decisions

| # | Decision | Provenance | Reason |
| --- | --- | --- | --- |
| D1 | Add **four feature sets** this round: **(1) Content lifecycle & validity · (2) Trust, approval & audit · (3) AI assistant & discovery · (4) Planning & resilience**. | `[explicit]` | user selected all four sets at the scope gate. |
| D2 | **Build order = top‑priority set first, then check in** with the user after each set, re‑entering the loop for the next. Order: **lifecycle → trust/approval → AI assistant → planning**. | `[explicit]` | user chose "Top‑priority set first, then check in". Lifecycle is foundational — expiry/status underpin preflight, alerts and the "still valid" guarantee the rest reference. |
| D3 | **All agentic AI work uses LangGraph** (`langgraph` + `langchain-core`), in `apps/api`, as the orchestration layer over the existing AI‑provider abstraction. Three graphs: Content Assistant, Builder (refactored), Preflight‑explain. | `[explicit]` | user advised LangGraph for all agentic work; it is Python‑native, models agents as a typed node/edge state machine, and ships streaming + checkpointing + human‑in‑the‑loop. |
| D4 | **AI is live at runtime, deterministic in tests.** The running product calls a real provider (keys from env, Contract 2); with no key the assistant surfaces "configure an AI provider" instead of faking output. **Tests inject `GenericFakeChatModel`** with scripted responses — hermetic, no key — so Contract 4 (determinism) holds. | `[explicit – adjusted]` | user chose "require a live provider"; this is the adjustment agreed in chat so a live requirement does not break the governed determinism contract. |
| D5 | **Tenant isolation holds throughout.** Every new query, tool, search and AI graph is scoped to the actor's tenant + permissions; destinations never touch (doc §6.4, §9). AI tools reuse the AC6 visibility contract so an agent can never reach unapproved/out‑of‑permission content, including via the assistant. | `[requirement]` | the doc's hardest boundary ("No destination can reach another destination's content… under any circumstance"). |
| D6 | **Reproducibility preserved.** New lifecycle transitions driven by an injectable clock (no hidden `datetime.now()` in logic); AI graphs seeded/faked in tests; same inputs + config → same output. | `[inferred]` | Contract 4 + the PoC must be reviewable. |
| D7 | Scope stays **PoC‑level**: simulated social sending (no real OAuth), single deployment, SQLite/Postgres as today; no real email/messaging delivery, no multi‑region data residency, no i18n of the UI chrome this round. | `[inferred]` | matches the doc's own "out of scope for PoC" posture and keeps the round shippable. |

## Full scope — the four feature sets (AC32–AC44)

### Set 1 — Content lifecycle & validity  *(built first)*
- **AC32 — Validity & status lifecycle.** Every catalog item carries a validity window
  (`valid_from` / `expires_at`) and a status in `draft → in_review → approved → expiring_soon →
  expired → withdrawn`. `expiring_soon` / `expired` are derived from the (injectable) clock. The
  status + validity show on the item for every role. (FR‑07/15/27/51)
- **AC33 — Auto‑withdraw & propagation.** Expired or withdrawn items disappear from the agent
  catalog, from search, from saved projects/drafts and from anything scheduled — without anyone
  acting — and editing a master item flags every in‑use copy. (FR‑52/53/56)

### Set 2 — Trust, approval & audit
- **AC34 — Preflight check before send.** Before an agent publishes/schedules, a check runs:
  brand rules, item validity (not expired), the agent's permissions, and channel requirements.
  On failure it returns the specific fixes **in plain words** (deterministic rules engine; one
  optional LangGraph LLM node phrases the message). (FR‑42)
- **AC35 — Send‑back‑with‑reason.** A reviewer returns an item to the uploader with a reason; it
  re‑enters review at the same point once corrected. (FR‑14)
- **AC36 — Off‑limits blocklist.** A board flags a subject/place off‑limits once; it then never
  appears in catalog, search, drafting or AI tool results. (FR‑08)
- **AC37 — Audit log.** Every upload, edit, approval, release, send‑back and withdrawal is
  recorded (actor, action, item, timestamp) and is exportable. (FR‑16, Contract 3)

### Set 3 — AI assistant & discovery  *(LangGraph)*
- **AC38 — Content Assistant.** A grounded, permission‑scoped assistant (LangGraph ReAct graph)
  that finds content and starts a post from plain‑language requests; it composes only from library
  tool output, so it cannot assert anything not in the library. Streamed to a web chat panel. (FR‑24/36)
- **AC39 — Natural‑language search.** Plain‑language queries ("beach photo, no people, cleared for
  Germany") resolve to structured filters over the approved, visible catalog. (FR‑23)
- **AC40 — Suggested next posts.** The platform recommends content worth sending from
  used/unused signals, so an agent never faces a blank screen. (FR‑33)

### Set 4 — Planning & resilience
- **AC41 — Content calendar.** A per‑destination/market calendar of scheduled + planned content. (FR‑57)
- **AC42 — Campaign packs.** A board releases a campaign as one pack (items + templates + timing)
  an agent/market accepts in a single action. (FR‑59)
- **AC43 — Crisis "pause all".** One action pauses all promotional sending across markets and
  swaps in approved messaging; a second resumes. (FR‑55)
- **AC44 — Alerts.** Agents are alerted when content they use is added, changed, withdrawn or
  expiring. (FR‑30/56)

## AI architecture (LangGraph) — how the agents work

LangGraph graphs live in `apps/api` (e.g. `app/agents/`), exposed through FastAPI endpoints
(SSE for streaming). Provider selection stays in the existing AI‑provider abstraction — it
chooses which LangChain chat model a graph binds (Claude/OpenAI/Gemini, keys from env). In tests,
graphs bind `GenericFakeChatModel` with scripted responses.

- **Content Assistant graph:** state `{messages, actor(role,tenant,permissions), results}`;
  `agent (LLM+tools) → [has tool calls?] → tools (ToolNode) → agent → END`. Tools are tenant‑ and
  permission‑scoped and reuse the AC6 visibility query: `search_catalog`, `get_item`,
  `suggest_next_posts`, `start_draft`, `answer_about_destination`.
- **Builder graph:** existing AC10 logic refactored onto LangGraph; grounded in selected items.
- **Preflight‑explain graph:** `run_checks (deterministic) → [failures?] → explain (LLM) → END`.

## Acceptance checklist — Increment 1 (Content lifecycle & validity)

Only Set 1 is promoted into `/REQUIREMENTS.md` + `requirements.manifest.yaml` for this increment;
Sets 2–4 are promoted on their turn so `make verify` stays green at each check‑in.

- **AC32 — Validity & status lifecycle.** Proof: pytest asserts the status derivation from an
  injected clock (approved → expiring_soon → expired at the boundaries) and that validity +
  status serialise on the item; Playwright shows the status/validity on a catalog item.
- **AC33 — Auto‑withdraw & propagation.** Proof: pytest asserts an expired item is absent from the
  agent catalog + search and is removed from a saved project's items / scheduled posts; editing a
  master flags in‑use copies.

All prior ACs (AC1–AC31) stay green. Determinism via an injectable clock; AI (none in Set 1).

## Out of scope this round
Real social/email/messaging delivery (simulated as today) · multi‑region data residency · UI
chrome i18n · duplicate detection (FR‑09) · delegated Walshe‑into‑board access (FR‑21) · full
multi‑destination provisioning UI (FR‑67). These remain in the framework backlog.

## Governance
Local branch `feat/content-hub-poc`; **no push/PR** without explicit approval. Each increment:
amend `/REQUIREMENTS.md` (version bump + change‑log row) + `requirements.manifest.yaml` first,
then build, then `make verify`, then check in.
