# Run ledger — Product Framework features (round 3)

Durable state for the `/oneshot-poc:run` building the next slice of the Product Framework doc.
Every phase reads this first and appends when done. Content-free: status + decisions only.

- **Charter (full):** `docs/plans/2026-10-03-product-framework-charter.md`
- **Active increment charter:** `docs/plans/2026-10-03-increment1-lifecycle-charter.md`
- **Branch:** `feat/content-hub-poc`
- **Current phase:** `C` (implement complete — Increment 1: lifecycle; `make verify` green, ready for review/human verify gate)
- **Outer loop:** `1/3` · **Inner loop:** `1/2`

## Requirement status (acceptance checklist — increment 1)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC32 | Validity & status lifecycle (derived from injectable clock) | met (3/3) | `app/clock.py` + `app/lifecycle.py` (`display_status`/`is_expired`, naive→UTC coercion for SQLite) + `EntryStatus` gains `in_review`/`withdrawn` + new `DisplayStatus` + `EntryOut.from_entry`; validity window on `CatalogEntry`/`EntryCreate`/`AccessUpdate` (inverted-window → 422). Tests `test_display_status_derived_from_clock`, `test_validity_and_status_serialise_on_entry` (+`test_validity_window_rejected_when_inverted`, `test_withdrawn_hidden_from_agent`); e2e `lifecycle-smoke.spec.ts` |
| AC33 | Auto-withdraw & propagation (catalog/search/projects/schedule) | met (3/3) | expiry choke-point in `visibility.is_visible_to_agent` (required `now` threaded through catalog/builder/render/assets/social routers; social adopts canonical `clock.now`) + `content_version`/`item_versions` + `GET /me/projects/{id}/resolved` (dropped+flagged). Tests `test_expired_absent_from_agent_catalog_and_search`, `test_expired_dropped_from_projects_and_schedule`, `test_master_edit_flags_in_use_copies` |

## Increment plan (top-priority first, check in after each set)

1. **Set 1 — Content lifecycle & validity (AC32–33)** ✅ done (`make verify` green)
2. Set 2 — Trust, approval & audit (AC34–37)
3. Set 3 — AI assistant & discovery, LangGraph (AC38–40)
4. Set 4 — Planning & resilience (AC41–44)

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | scope gate: 4 sets, top-priority-first, LangGraph, live-runtime/fake-tests AI | charter confirmed |
| setup | promoted AC32–33 to REQUIREMENTS v2.5.0 + manifest; wrote increment-1 charter | — |
| B (brainstorm) | brainstormed 3 approaches for AC32–33 (cited); chose A — read-time derivation in `visibility.py` + injectable `app/clock.py` + one `display_status` helper; B (sweep) rejected per charter, C (SQL predicate) deferred to post-PoC scale | `docs/brainstorms/2026-10-03-increment1-lifecycle.md`; proceed to plan |
| B (plan) | wrote concrete plan for AC32–33: new `app/clock.py` + `app/lifecycle.py`; `EntryStatus` gains `in_review`/`withdrawn` + new `DisplayStatus`; `CatalogEntry` gains `valid_from`/`expires_at`/`content_version`, `Composition` gains `item_versions`; `now` threaded (required arg) through `visibility.py` + catalog/builder/render/assets/social routers; `EntryOut.from_entry`; new `GET /me/projects/{id}/resolved` (dropped+flagged) proves AC33 propagation+master-edit-flag; seed validity fixtures (current/expiring_soon/expired); regen OpenAPI/TS; web catalog status+validity badges for AC32 e2e; 6 named api tests + 1 e2e matching the manifest | `docs/plans/2026-10-03-increment1-lifecycle-plan.md`; proceed to implement |
| C (implement) | built the plan: `app/clock.py`, `app/lifecycle.py` (added naive→UTC coercion — SQLite returns tz-naive datetimes for `DateTime(timezone=True)`), model cols + `DisplayStatus`, `EntryOut.from_entry` + validity validators, `now` threaded through the visibility choke-point and catalog/builder/render/assets routers, social adopts canonical `clock.now`, `/me/projects/{id}/resolved` + `item_versions` snapshot, seed validity fixtures, regen OpenAPI/TS, web catalog badges. Fixed spec drift: `**AC32**`/`**AC33**` headers reformatted to the recognised compact bold so `check_requirements_sync` detects them. Updated affected tests (`test_visibility_by_ids`, `test_assets`, `test_social`). Added `test_lifecycle.py` (8 tests). | `make verify` green: 107 api passed/1 skip, 25 e2e passed, matrix 33/33 met (AC32 3/3, AC33 3/3), sync 33/33. Lint/types/compose clean |

## Open assumptions / deferrals
- AI behaviour: live provider at runtime, `GenericFakeChatModel` in tests (D4) — applies from Set 3.
- Sets 2–4 deferred to later increments (user chose check-in cadence).

## Blockers (if STUCK)
- (none)
