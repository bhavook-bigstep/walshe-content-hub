# Increment-1 Charter — Content lifecycle & validity (AC32–AC33)

**Date:** 2026-10-03 · **Version:** 1.0 · **Parent:** `docs/plans/2026-10-03-product-framework-charter.md`
(full four-set plan). This file is the **acceptance contract for THIS increment only** — the build
loop verifies against the two items below, nothing else. Sets 2–4 are deferred to later increments.

## Acceptance checklist (this increment)

- **AC32 — Validity & status lifecycle.** Every catalog item carries a validity window
  (`valid_from`, `expires_at`, both nullable) and a **stored** status in
  `draft → in_review → approved → withdrawn`. The **display** status adds `expiring_soon` and
  `expired`, **derived** from `expires_at` vs. an injectable clock (approved + within the
  expiring-soon window → `expiring_soon`; past `expires_at` → `expired`). Validity + derived
  display status serialise on every item, for every role.
  **Proof:** `apps/api/tests/test_lifecycle.py` asserts the derivation at the clock boundaries
  (approved → expiring_soon → expired) and that validity + status serialise on `EntryOut`;
  `apps/web/e2e/lifecycle-smoke.spec.ts` shows the status + validity on a catalog item.

- **AC33 — Auto-withdraw & propagation.** An `expired` or `withdrawn` item disappears **on its own**
  (no sweep job needed — derived at read time) from: the agent catalog, search results, saved
  projects' resolved items, and anything scheduled. Editing a master item flags every in-use copy.
  **Proof:** `apps/api/tests/test_lifecycle.py` asserts an expired item is absent from the agent
  catalog + search and is dropped from a saved project's items and scheduled posts; and that a
  master edit flags in-use copies.

## Design constraints (must follow)

1. **Injectable clock.** Add `app/clock.py` with a `now()` provider overridable in tests (e.g. a
   FastAPI dependency / module-level override). **No bare `datetime.now()`/`utcnow()` in logic** —
   Contract 4 (reproducibility). Tests set the clock to fixed instants.
2. **Single visibility choke-point.** Extend `app/services/visibility.py` so expired/withdrawn
   items are excluded there — do NOT scatter expiry checks across routers. AC6 still holds.
3. **Derived, not stored, for `expiring_soon`/`expired`.** Stored enum gains `in_review`,
   `withdrawn`; display status is computed. A single helper computes display status from
   (stored status, expires_at, clock).
4. **Serialisation.** `EntryOut` gains `valid_from`, `expires_at`, and `display_status`. Regenerate
   OpenAPI types (`make` api-types sync must pass).
5. **New models registered** in `app/models/__init__.py` if any; migrations/`create_all` stay green;
   seed gives items sensible validity (a current, an expiring-soon, and an expired fixture) and
   stays idempotent (AC17).
6. **Determinism + hermetic tests** (testing.md); synthetic fixtures only; ~90% on changed lines.
7. All prior ACs (AC1–AC31) stay green. `make verify` is the gate. Branch `feat/content-hub-poc`;
   **no push/PR**.

## Out of scope this increment
Sets 2–4 (preflight/approval/audit, AI assistant via LangGraph, planning/resilience). Do not build
them now.
