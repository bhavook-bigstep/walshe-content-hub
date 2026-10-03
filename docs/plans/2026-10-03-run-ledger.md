# Run ledger — Product Framework features (round 3)

Durable state for the `/oneshot-poc:run` building the next slice of the Product Framework doc.
Every phase reads this first and appends when done. Content-free: status + decisions only.

- **Charter (full):** `docs/plans/2026-10-03-product-framework-charter.md`
- **Active increment charter:** `docs/plans/2026-10-03-increment1-lifecycle-charter.md`
- **Branch:** `feat/content-hub-poc`
- **Current phase:** `⏸ G` (Increment 1 complete & independently verified; awaiting human check-in before Set 2)
- **Outer loop:** `3/3` · **Inner loop:** `2/2`

> **Note on the engine result:** the build-loop workflow returned `status:stuck, stage:budget`
> (outer budget exhausted, `gaps:null`). This was a **false negative**: reviewers kept setting
> `needsDesignChange=true` on already-complete work, so every outer loop re-planned (E→C) and never
> reached a clean Acceptance phase. Independent `make verify` run by the orchestrator: **33/33 ACs
> met (AC32 3/3, AC33 3/3), sync OK, tree clean** — Increment 1 is genuinely done. For later
> increments, consider raising `maxOuter` or softening the reviewers' re-plan trigger.

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
| B (plan, re-run) | reviewed charter + existing plan/brainstorm against shipped code for AC32–AC33. Verified the plan is concrete and matches reality: `clock.py`, `lifecycle.py` (`display_status`/`is_expired` + `_aware` naive→UTC coercion), visibility choke-point `now`-threading + `is_expired`, `EntryOut.from_entry` + `_check_validity_window` validators (422 on inverted window), `ProjectResolved` + `/me/projects/{id}/resolved`, and all 8 `test_lifecycle.py` tests + `lifecycle-smoke.spec.ts` all present as planned. No plan revision needed — exact files/functions, dependency graph, and a named test per acceptance item already hold. | plan accepted as-is; matrix unchanged 33/33 (AC32 3/3, AC33 3/3); no code change this phase |
| C (implement, re-run) | re-ran the implement phase against the increment-1 charter on already-shipped AC32–AC33 code. Confirmed all lifecycle artefacts present (`app/clock.py`, `app/lifecycle.py`, `test_lifecycle.py` [7 tests, all pass], `lifecycle-smoke.spec.ts`). Ran full `make verify` for REAL results — no code change required; increment already complete. | `make verify` green: 107 api passed/1 skip (108), 16 web vitest, 25 e2e passed (0 flaky/unexpected), matrix 33/33 met (AC32 3/3, AC33 3/3), sync 33/33. Lint/types/compose clean |
| B (plan, re-run 2) | re-verified the increment-1 plan against shipped AC32–AC33 code via grep/read. Every planned artefact present and matching: `clock.py`, `lifecycle.py` (`display_status`/`is_expired` + `_aware` coercion), `EntryStatus` (+`in_review`/`withdrawn`) + `DisplayStatus`, `CatalogEntry.valid_from`/`expires_at`/`content_version`, `Composition.item_versions`, visibility `now`-threading (`is_visible_to_agent`/`agent_visible_entries`/`_by_ids`/`visible_asset_or_none` all require `now`, call `is_expired`), `ProjectResolved` + `GET /me/projects/{id}/resolved` (`dropped_item_ids`/`flagged_item_ids`), `_snapshot_item_versions`, e2e testids `entry-status`/`entry-validity`. All 7 `test_lifecycle.py` names present and match the manifest (2 AC32 + 3 AC33 + 2 risk/regression). **Plan revision:** added the shipped `_aware` naive→UTC coercion to plan §1.2 (SQLite returns tz-naive for `DateTime(timezone=True)`) so the plan matches reality. | plan accepted + revised (§1.2); no code change; matrix unchanged 33/33 (AC32 3/3, AC33 3/3) |
| C (implement, re-run 2) | re-ran implement against the increment-1 charter. Drift check: all planned artefacts present (`app/clock.py`, `app/lifecycle.py`, `app/services/visibility.py`, `apps/api/tests/test_lifecycle.py` [7 tests], `apps/web/e2e/lifecycle-smoke.spec.ts`); all 7 test names match the manifest. Working tree held only the two plan docs (prior-phase edits) — AC32–AC33 code already committed (a1af104/580b6fd). Ran full `make verify` for REAL results; no code change required — increment already complete. | `make verify` all gates passed: 107 api passed/1 skip (108), 16 web vitest, 25 e2e passed (0 flaky/unexpected), matrix 33/33 met (AC32 3/3, AC33 3/3), sync 33/33. Lint/types/compose clean |

## Open assumptions / deferrals
- AI behaviour: live provider at runtime, `GenericFakeChatModel` in tests (D4) — applies from Set 3.
- Sets 2–4 deferred to later increments (user chose check-in cadence).

## Blockers (if STUCK)
- (none)
