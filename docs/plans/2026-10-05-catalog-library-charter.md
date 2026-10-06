# Requirements Charter — Catalog Library (entity-model epic · Increment 2)

**Date:** 2026-10-05 · **Version:** 1.0.0 · **Status:** for confirmation
**Supersedes** the "Increment 2" row of `docs/plans/2026-10-05-entity-model-charter.md` with the
user's corrected catalog model.
**Branch:** `feat/content-hub-poc` (local only)

## Vision (from the user)

Turn the flat catalog into a **catalog library**:

- A **provider** owns many **catalogs** (their library). A catalog has a name + a **category**
  label and a **visibility**: **public** (usable by every agent) or **private** (usable only by
  agents it is **shared** with).
- A **catalog** holds **entries** (real-world things — event, place, offer, …).
- An **entry** decomposes into **items** — every piece of **text** and every piece of **media**
  (image / video) is its own first-class **item**.
- In the **Design Studio** an agent **browses a catalog** they can access and pulls its entries'
  **items** (text + media) onto the canvas as real source data to build images / videos.
- Agents may also use **their own uploaded** images/videos (not from a provider catalog).

## Governance change (requires your confirmation)

**Contract 1 / AC6 mechanism changes from per-entry approval to catalog-level publish/share.**
Today only `approved` + `brand_safe` + in-scope entries reach agents. Under the new model, **an
agent can use a catalog's items iff the catalog is public, or private and shared with them** — the
provider's act of publishing/sharing a catalog *is* the verification act. Contract 1's **intent**
(only content a provider deliberately makes available reaches agents) is preserved; the enforcement
moves to the catalog. `/REQUIREMENTS.md` Contract 1 + **AC6** are amended (version bump + change-log)
and the AC6 test is rewritten to assert catalog-gating. The lifecycle/trust ACs are reconciled:
**AC32–33** (validity/expiry) still apply per entry; **AC34–37** (preflight, send-back, blocklist,
audit) still apply at agent send-time; the per-entry *approval* step (part of AC6/AC35) is retired
in favour of catalog publish/share.

## Scope decisions

| # | Decision | Value | Provenance |
| --- | --- | --- | --- |
| D1 | Hierarchy | **Catalog → Entry → Item** (catalog has a `category` label) | `[explicit]` |
| D2 | Catalog model | `Catalog{ id, provider_id, name, category, visibility: public\|private, created_at }` | `[explicit]` |
| D3 | Sharing | Private catalog ↔ agents via a share list; public = all agents. Agent access = **catalog-gated only** | `[explicit]` |
| D4 | Entry | Belongs to a catalog (`catalog_id`); keeps type/validity; its content lives in items | `[explicit]` |
| D5 | Item | `Item{ id, entry_id, kind: text\|image\|video, order, text?, object_key?, content_type?, title?, alt? }` | `[explicit]` |
| D6 | Media uploads | Providers upload image **and video** items to entries; agents upload their **own** image/video (owner-scoped), type/size validated | `[explicit]` |
| D7 | Studio browse | An API lists catalogs an agent can access → entries → items (+ the agent's own uploads); the **picker UI is Increment 3** | `[explicit]` |
| D8 | Provider management | Providers CRUD catalogs/entries/items, set public/private, and share private catalogs with agents (API + a basic provider UI) | `[inferred]` |
| D9 | Contract 1 | Enforced at the **catalog** level in the single `services/visibility` choke-point (public OR shared) | `[explicit – feedback]` |
| D10 | Migration | Existing entries + assets migrate into per-provider catalogs: approved+brand-safe → a **public** "Imported" catalog, others → a **private** one; `title`/`description`/`custom_sections` → text items, `assets` → media items | `[inferred]` |
| D11 | Determinism | Pure/injected boundaries; hermetic tests; migration deterministic (Contract 4) | `[requirement]` |
| D12 | Prior ACs | AC1–AC48 stay green except the **AC6 amendment** (catalog-gating) + its reconciled trust ACs, which are updated in the spec with this change | `[inferred]` |

## Acceptance checklist (the contract)

### AC49 — Catalog library + catalog-level access (amends Contract 1/AC6)
- **AC49.1** `Catalog` model (provider-owned; name; category; `visibility` public|private) + a
  share mechanism (private ↔ agent). Entries gain `catalog_id`.
- **AC49.2** `services/visibility` gates agent access **by catalog**: an agent sees a catalog's
  entries/items iff the catalog is public, or private and shared with them — enforced in the one
  choke-point. Per-entry approval is no longer the gate.
- **AC49.3** Providers CRUD their catalogs, set public/private, and share private catalogs with
  specific agents (API + basic provider UI).
- **AC49.4** Deterministic migration moves existing entries+assets into per-provider catalogs
  (approved→public "Imported", else private) with no data loss; prior catalog/asset reads keep working.
- Proof: pytest (catalog-gating: public visible to any agent, private hidden unless shared; provider
  CRUD + share; migration) + an e2e where a provider shares a private catalog and the agent gains access.

### AC50 — Entries decompose into first-class items (text + media), incl. video
- **AC50.1** `Item` model (`kind: text|image|video`, ordered, with text or media fields); an entry's
  text (title/description/sections) and media become items.
- **AC50.2** Providers add/edit/remove text items and upload **image and video** media items to an
  entry (type/size validated at the boundary).
- **AC50.3** A browse API returns the catalogs an agent can access → entries → items, for the studio.
- Proof: pytest (item CRUD, video upload accepted + bad type/size rejected, browse API returns only
  accessible catalogs' items, migration of text+assets to items).

### AC51 — Per-user media storage (Local + Agent), by origin
Each user has their **own storage** (their S3/MinIO prefix) holding a `UserAsset` tagged by
**source** — `local` (the user **uploaded** it) or `agent` (an **AI/LLM service generated** it) —
and **kind** (image/text/video). The studio media picker therefore has three sections: **Catalog**
(provider items, in the catalog owner's storage), **Local** (user uploads), **Agent** (generated).
- **AC51.1** `UserAsset{ owner_id, source: local|agent, kind, object_key?, content_type?, text?,
  title }`, stored under the owner's prefix; **owner-scoped** (only the owner reads their assets).
- **AC51.2** **Local:** the user uploads image / video / text (type + size validated) → stored
  `source=local`.
- **AC51.3** **Agent:** a generate endpoint produces **image + text** via the AI provider
  abstraction (deterministic stub offline; Contract 2/4 preserved) → stored `source=agent`.
  Generation is limited to image + text — no generated video/animation (animation = sprites).
- **AC51.4** A list API returns the user's assets filtered by source, for the Local / Agent sections.
- Proof: pytest (upload image/video/text → local; generate → agent image+text; list by source;
  another user cannot see them).

> **Charter amendment:** this reverses the earlier "asset selection only, no generative imagery"
> guard for the **Agent** section — AI-generated image+text are now in scope (stubbed
> deterministically for the PoC; a real image model only when configured).

## Out of scope (scope guard)
The studio media-picker UI + entity model (Increment 3) · animation/video/sprite render
(Increment 4) · external (non-catalog, non-upload) URLs · per-item approval/moderation workflow ·
a 4th "category" level · real CDN/transcoding (store + serve as-is).

## Governance
On confirmation: amend `/REQUIREMENTS.md` (Contract 1 + AC6 → catalog-gating; add **AC49–AC51**;
version bump + change-log) and `requirements.manifest.yaml`; rewrite the AC6 proof to catalog-gating;
`make verify` is the gate. Built in two internal phases (49 model+access+migration, then 50–51
items+uploads) to keep the loop tractable.
