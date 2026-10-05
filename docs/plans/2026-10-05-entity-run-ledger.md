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
| AC48 | Studio interaction & theming fixes | met | left-drag pan + wheel-zoom-to-cursor (fixed a pointer-events bug: the closed storyboard drawer swallowed canvas events); zoom pill clear of assistant FAB; light-theme selected-text (bg-walshe-mint→bg-walshe-teal text-white), also fixed app-wide; dot spacing floored (DOT_MIN_PX); entity select/move/resize/**delete** (`deleteNode` op + `shouldDeleteSelection` guard + Delete key). `make verify` **48/48**. 3 reviewers APPROVED_WITH_COMMENTS (no P1); P2s applied — app-wide theme fix, delete-guard unit tests, strengthened e2e, bottom-dock pointer-events. e2e `studio-interaction-smoke`. |

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
