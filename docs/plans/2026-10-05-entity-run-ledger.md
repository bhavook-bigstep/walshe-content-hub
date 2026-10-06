# Run ledger — AI-authorable studio + re-modelled catalog (entity-model epic)

Durable state for the `/oneshot-poc:run` building the entity-model epic. Content-free: status only.

- **Charter:** `docs/plans/2026-10-05-entity-model-charter.md` (v1.0.0, confirmed)
- **Branch:** `feat/content-hub-poc`
- **Engine note:** run **directly** (implement → parallel reviewers → fix → acceptance), per
  in-session evidence the bundled build-loop workflow false-negatives here. `make verify` is the gate.

## Increment plan

1. **Increment 1 — Studio interaction & theming fixes (AC48).** ✅ done (`eb96d23`; CI green; PR #1).
2. **Increment 2 — Catalog Library** (charter `docs/plans/2026-10-05-catalog-library-charter.md`,
   v1.0.0 confirmed): Catalog→Entry→Item hierarchy, catalog public/private + sharing as the sole
   access gate (**amends Contract 1/AC6**), entries decompose into text+media items (incl. video),
   agent uploads, browse API. AC49 (model+access+migration) · AC50 (items+video+browse) · AC51
   (agent uploads). ← **active** (phase 2a: AC49). Picker UI deferred to Inc 3.
3. Increment 3 — Declarative entity model + studio media picker (catalog items + uploads).
4. Increment 4 — Entity-aware animation + video/sprite render.

## Status

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC48 | Studio interaction & theming fixes | met (`eb96d23`) | pan/zoom fix (pointer-events), zoom pill, light-theme text (app-wide), dot spacing, entity delete. 48/48. |
| AC49 | Catalog library + catalog-level access (Contract 1 re-base) | met (`b61fa0d`) | Catalog model + catalog-gating in `services/visibility` (legacy fallback keeps prior ACs green); provider CRUD/share API + UI; deterministic idempotent migration. pytest `test_catalogs` (3) + e2e. |
| AC50 | Entries → first-class items (text + media incl. video) + browse | met (uncommitted) | `Item` model; provider text/media(image+video) CRUD; catalog-gated `GET /catalogs/{id}/entries`; generalized `can_read_object` serving across 3 stores; `decompose_entries_to_items` migration. pytest `test_items` (3). |
| AC51 | Per-user media storage (Local uploads + Agent generated) | met (uncommitted) | `UserAsset` (source local|agent + kind) under the user's own prefix; `/me/library` upload/text/generate/list; deterministic PNG generation stub; owner-scoped serving. pytest `test_user_media` (2). |

**Model (user-clarified):** provider **catalog library** (catalogs public/private + share) → entries →
items; studio media picker sections by **origin**: **Catalog** (provider), **Local** (user upload),
**Agent** (AI-generated) — Local+Agent in the user's own storage. Generation = image+text (animation
= sprites). `make verify` **51/51** after AC49–51.

## Increment 2 review (AC49–51)

3 reviewers on the full diff — security + tests **APPROVED_WITH_COMMENTS**; architecture
**CHANGES_REQUIRED** (2 P1s). Both P1s resolved:
- **P1-A (catalog gate drops approved/brand-safe + per-entry scope):** this is the user's confirmed
  model ("catalog sharing is the only gate" — publish = put in a public/shared catalog), so resolved
  by making AC6 explicit (removed the contradictory "drafts never exposed"; stated the deliberate
  drop of per-entry status/brand_safe/AC37-scope for catalog entries) + the behaviour is tested. Did
  **not** re-add approval (would contradict the user).
- **P1-B (migration never invoked / no Alembic):** wired `migrate_entries_to_catalogs` +
  `decompose_entries_to_items` into `app.seed` so they run on a real path. The PoC uses
  `create_all` (no Alembic) — an existing pre-AC49 dev DB must be **re-seeded** (fresh schema);
  e2e already uses a throwaway DB. Noted as the PoC persistence stance.

P2 fixes applied: server-generated uuid storage key in the legacy `upload_image` (was client
filename — overwrite risk); 25 MB upload cap (`app/uploads.read_capped`) on all three upload
endpoints; `title` Form `max_length=300`; `visible_catalogs_for_agent` choke-point helper used by
`/catalogs/accessible`. Added tests: expired-entry-in-public-catalog hidden, private-catalog item
media gated by sharing (404→share→200), owner-scoped `/me/library` list + `?source=` 422.
Deferred (noted): cross-provider item-authz tests, magic-byte sniffing, Alembic, orphaned stored
objects on item delete, `created_at` via injected clock.

## Notes / discovered

- **App-wide light-theme contrast bug (pre-existing, out of AC48 scope):** the same dark-on-dark
  `bg-walshe-mint text-walshe-teal` combo appears outside the studio — `globals.css` `.pill` + the
  `bg-white…hover:bg-walshe-mint` button hover, `components/ui/StatTile.tsx`,
  `components/shell/AssistantWidget.tsx`, `components/brand/WalsheLogo.tsx`, `app/agent/page.tsx`,
  `app/admin/page.tsx`, `app/provider/catalog/new/page.tsx`. Surface at ⏸ G; fix as a small
  follow-up or fold into a later increment.

## Phase log

- **A2** — Scope QA: user reframed to a declarative entity model (scenes→entities) with media from
  catalog **or** uploads, **full catalog re-model**, sprites included, + 4 studio bug fixes. Sequenced
  into 4 increments; Increment 1 (AC48) confirmed + built.
- **D IMPLEMENT** — AC48 built; tsc + vitest (25) + studio-interaction e2e (2) green.
- **E REVIEW** — code-quality · architecture · tests: all APPROVED_WITH_COMMENTS, no P1. Applied:
  app-wide light-theme fix (StatTile, AssistantWidget, WalsheLogo, admin, agent home, provider
  file-input, `.btn-on-dark` hover); extracted `shouldDeleteSelection` (pure) + unit table;
  deleteNode scene-bounds test; bottom-dock closed → `pointer-events-none`; CLICK_SLOP const;
  removed dead testid; strengthened pan/zoom/delete e2e (exact pan delta, zoom-in, empty-selection
  no-op, click-point guard); login deduped via `_helpers`. Deferred (noted): design-level undo.
- **F ACCEPTANCE** — `make verify` **48/48**, sync OK.
