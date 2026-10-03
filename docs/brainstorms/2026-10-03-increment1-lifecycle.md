# Brainstorm — Content lifecycle & validity (AC32–AC33)

**Date:** 2026-10-03 · **Phase:** B (brainstorm) of `/oneshot-poc:run`
**Charter:** `docs/plans/2026-10-03-increment1-lifecycle-charter.md`
**Scope:** Increment 1 only (AC32–AC33). Sets 2–4 deferred.

## 1. Frame

**Goal.** Give every catalog item a validity window (`valid_from`, `expires_at`, both nullable)
and a stored lifecycle status (`draft → in_review → approved → withdrawn`); layer a **derived**
display status (`expiring_soon`, `expired`) computed from `expires_at` vs. an injectable clock;
and make `expired`/`withdrawn` items disappear on their own from the agent catalog, search, saved
projects' resolved items, and scheduled posts — plus flag in-use copies when a master is edited.

**Inputs (what exists today).**
- `EntryStatus` enum has only `draft`, `approved` (`apps/api/app/models/catalog.py:28`).
- `app/services/visibility.py` is already the single agent-facing choke-point; it filters on
  `status == approved` + `brand_safe` and does the access-scope (JSON membership) test in Python.
- `EntryOut` (`apps/api/app/schemas/catalog.py:46`) has no validity/status-display fields.
- No `app/clock.py` yet. No background job infra.

**Constraints (charter + repo contracts).**
- Injectable clock; **no bare `datetime.now()/utcnow()` in logic** (Contract 4, reproducibility).
- Derived `expiring_soon`/`expired` — **not stored**; one helper computes display status.
- **Single visibility choke-point** — extend `visibility.py`, don't scatter expiry checks.
- Deterministic, hermetic tests; ~90% on changed lines; `make verify` is the gate.

**Out of scope.** Preflight/approval/audit (Set 2), AI assistant/LangGraph (Set 3), planning/
resilience (Set 4). No push/PR.

## 2. Prior art

**Internal.** `docs/solutions/INDEX.md` is empty (no prior lifecycle/clock learning).
`.claude/rules/critical-patterns.md` is empty. `visibility.py` already establishes the
"one choke-point, access-scope filtered in Python for portability" idiom — the brainstorm
should fit that shape, not fight it.

**External.** See per-approach citations in §4.

## 3. Approaches

The charter fixes the *what* (derived status, injectable clock, one choke-point). The real
divergence is **where the expiry predicate runs** and **how display status is assembled**.

### Approach A — Pure read-time derivation in the visibility layer (Python post-filter)
- **Core idea.** Add `app/clock.py` exposing `now()` as a FastAPI dependency. Add one pure
  helper `display_status(stored, expires_at, now, *, soon_window)` in a small `lifecycle`
  module. Extend the existing `visibility.py` functions to accept a `now` value and drop
  `withdrawn`/`expired` entries right after the current access-scope test (same Python-loop
  idiom already there). `EntryOut` gains `valid_from`/`expires_at`/`display_status`, populated
  by a thin assembler that calls the helper. Projects/search/schedule reuse the same
  `agent_visible_entries*` functions, so propagation (AC33) is automatic.
- **Fits contracts.** One choke-point preserved; clock injected (Contract 4); derivation is a
  single tested helper; mirrors the existing portable-Python-filter pattern.
- **Effort.** Low. Touches `clock.py` (new), `lifecycle` helper (new), `catalog.py` model +
  enum, `visibility.py`, `EntryOut`, seed, OpenAPI types.
- **Main risk.** `now` must be threaded through every visibility call site; miss one and it
  silently reads the real clock. Mitigation: make `now` a required arg (no default) so a
  missed call site fails loudly at the type/call level.

### Approach B — Stored `display_status` refreshed by a sweep/cron job
- **Core idea.** Persist the display status in a column and recompute it on a schedule
  (background task / cron) comparing `expires_at` to wall-clock.
- **Fits contracts.** Poorly. The charter **explicitly forbids a sweep** ("no sweep job
  needed — derived at read time"), and a sweep leaves a staleness window where an expired item
  is still shown — a direct Contract 1 / AC6 trust breach. Also adds hidden state (Contract 4).
- **Effort.** Medium–high (job infra, idempotency, clock plumbing into the job too).
- **Verdict.** **Rejected** — listed for honesty. Its failure mode is exactly why A/C derive at
  read time: a TTL/sweep guarantees only eventual removal, not immediate invisibility.

### Approach C — Push the expiry predicate into SQL (DB-computed filter)
- **Core idea.** Same clock + helper as A, but the expiry/`withdrawn` filter moves into the
  `select()` WHERE clause: `status IN (approved)` and
  `(expires_at IS NULL OR expires_at > :now)`, binding the injected clock as a parameter.
  Access-scope stays in Python (JSON membership). Display status still assembled by the shared
  helper for serialisation.
- **Fits contracts.** One choke-point kept, but the visibility predicate is now **split** —
  expiry in SQL, access-scope in Python — two places to reason about "what an agent sees".
- **Effort.** Low–medium. Must confirm SQLite (tests/dev) and Postgres agree on datetime bind
  comparison semantics against the fixed test clock.
- **Main risk.** Split predicate weakens the single-choke-point clarity the repo values; the
  payoff (no full-table Python scan) doesn't matter at PoC scale.

## 4. Citations — [BLOCKING]

- **Approach A** — *Testing Dependencies with Overrides — FastAPI (tiangolo) —*
  https://fastapi.tiangolo.com/advanced/testing-dependencies/ (accessed 2026-10-03).
  Official docs confirm `app.dependency_overrides[clock.now] = fake_now` is the supported way to
  swap a dependency per-test, which is exactly how the injectable clock becomes deterministic.
- **Approach B** — *Time to Live (TTL) — PingCAP / TiDB docs —*
  https://docs.pingcap.com/tidb/stable/time-to-live/ (accessed 2026-10-03). States a background
  TTL sweep "does not guarantee that all expired data is deleted immediately… the client might
  still read that data some time after the expiration time" — the staleness window that makes a
  sweep wrong for a trust-gated catalog, motivating read-time derivation instead.
- **Approach C** — *Soft Delete vs Archive Table: The Choice That Haunts Your Queries —
  Gabriel Anhaia, DEV Community —*
  https://dev.to/gabrielanhaia/soft-delete-vs-archive-table-the-choice-that-haunts-your-queries-2n8k
  (accessed 2026-10-03). Explains that a status/validity filter "pays at read time" and that
  pushing the predicate into the query is the scalable form — the argument for a SQL WHERE
  filter over a Python post-scan.

## 5. Compare & recommend

| Approach | Effort | Main risk | Source / AI |
|---|---|---|---|
| **A — Python read-time filter in visibility.py** | Low | Thread `now` to every call site | FastAPI docs |
| B — Stored status + sweep job | Med–High | Staleness window (charter-forbidden) | TiDB TTL docs |
| C — SQL WHERE expiry predicate | Low–Med | Visibility predicate split SQL/Python | DEV (soft-delete) |

**Recommended: Approach A.** It matches the existing `visibility.py` idiom (one choke-point,
access-scope filtered in Python), keeps the entire visibility decision in one readable place,
and makes clock-boundary testing trivial via FastAPI dependency overrides. The only real cost —
a Python scan of candidate rows — is irrelevant at PoC scale, and the "thread `now` everywhere"
risk is neutralised by making `now` a required argument so an omission fails loudly.

**Time-box impact.** Smallest of the three; no new infra (vs B) and no cross-DB datetime
semantics to verify (vs C). Leaves budget for the AC33 propagation tests (projects + schedule)
which are the harder proof.

**Trade-off noted.** Choosing A over C means we keep a full-candidate Python scan instead of a
DB-side filter; if the catalog ever grows past PoC size, migrate the expiry predicate into the
`select()` (Approach C) while keeping the same shared `display_status` helper.

## 6. Decide

Proceed to `/oneshot-poc:plan` with **Approach A**.
