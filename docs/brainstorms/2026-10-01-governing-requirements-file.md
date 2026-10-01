# Brainstorm — a separate, top-level requirements file that is *governed* and *governs*

- **Date:** 2026-10-01
- **Phase:** B (brainstorm) of `/oneshot-poc:run`
- **Charter:** `/REQUIREMENTS.md` (v1.0.0, ACTIVE) · **Ledger:** `docs/plans/2026-10-01-run-ledger.md`
- **User request (verbatim, governing):** "store the final requirements we build in a separate
  file at top level that can be goverend [governed] and govern"

## 1. Frame

**Goal.** The final requirements must live in one separate, top-level file that is both
**governed** (change-controlled: versioned, reviewed, auditable — nobody edits scope casually) and
**governing** (authoritative: the build loop, reviewers, and acceptance verify against it, and a
drift between code and spec is a bug in the code).

**Inputs.** `/REQUIREMENTS.md` already exists at repo root with stable IDs `AC1`–`AC18`,
provenance tags, a Governance section, and a Change log. The run ledger mirrors the AC list as a
status matrix. `.claude/rules/citations.md` requires every idea to carry a source or the disclaimer.

**Constraint.** PoC scope, YAGNI. The question is *not* "should the file exist" — it does — but
**how its two jobs (governed + governing) are actually enforced** so "govern" is real, not prose.

**Out of scope.** A requirements-management SaaS (Jama/DOORS), a custom DSL, or anything needing
infra beyond the repo's existing Git + CI + pytest/vitest.

## 2. Prior art

- **Internal:** `/REQUIREMENTS.md` §Governance (IDs, semver, change log, approval), `CLAUDE.md`
  §"Governing requirements", `AGENTS.md` approval gates, `docs/solutions/INDEX.md` (empty — no
  prior learning on this). No existing enforcement code links tests back to `AC#`.
- **External:** searched below; cited per approach.

## 3. Approaches

### A — Governed Markdown, prose-governing (keep current shape)
Single root `REQUIREMENTS.md`: stable IDs + semver + change log + PR/approval = **governed**.
"Governs" by convention: humans and the `acceptance-reviewer` *read* it and judge each `AC#`
met/partial/missing. **Effort:** ~0 (already built). **Risk:** "govern" is only as strong as a
reviewer's diligence — nothing mechanically fails when code drifts from the spec; the status
matrix can silently go stale.
**Source:** *What is Docs as Code? Guide to Modern Technical Documentation — Kong —
https://konghq.com/blog/learning-center/what-is-docs-as-code (accessed 2026-10-01)* — establishes
the governed-by-Git, reviewed-by-PR, versioned-plain-text model this approach already uses.

### B — Executable acceptance manifest (spec turns the build red)
Keep the Markdown prose, but add a machine-readable sidecar (`requirements.lock.yaml` or
front-matter) listing each `AC#` → the test IDs / Playwright specs that prove it. CI maps test
results onto the manifest and emits the met/partial/missing matrix automatically; a missing or
failing proof fails the build. The spec literally governs because a sentence that no longer holds
turns CI red. **Effort:** medium (write the manifest + a mapper script wired into CI).
**Risk:** the manifest must be kept in lockstep with tests; a stub/placeholder test can fake "met".
**Source:** *Specification by example — Wikipedia —
https://en.wikipedia.org/wiki/Specification_by_example (accessed 2026-10-01)* — the single-source
spec is executed as tests, so coverage is measured against requirements and drift fails the build.

### C — Requirements Traceability Matrix (RTM) as a generated artifact
Treat the root file as the requirement register and *generate* a traceability matrix linking each
`AC#` → design element → code path → test, regenerated in CI. "Governs" via explicit bidirectional
links auditable at a glance; strong for coverage gaps. **Effort:** medium–high (tag code/tests
with AC refs + a generator). **Risk:** heavier ceremony than a PoC warrants; links rot if tagging
is skipped. **Source:** *Requirements Traceability Matrix Template — Atlassian —
https://www.atlassian.com/software/jira/templates/requirements-traceability-matrix (accessed
2026-10-01)* — defines the RTM as the artifact linking each requirement to its verification.

### D — Hybrid: governed Markdown + thin machine-readable manifest in CI (recommended)
Markdown root file stays the **human** source of truth and the governed object (IDs, semver,
change log, PR approval — unchanged). Add one *thin* generated/checked block — the status matrix —
backed by the test suite via a small mapper (the light half of B), run in CI and in the run loop's
acceptance phase. Governed by review; governs by a failing check when an `AC#` has no passing
proof. **Effort:** low–medium (reuse A as-is; add only the mapper + matrix refresh). **Risk:** two
representations of the AC list can diverge — mitigated by generating the matrix, never hand-editing
it. **Source:** *Compliance as Code Explained — Wiz —
https://www.wiz.io/academy/compliance/compliance-as-code (accessed 2026-10-01)* — policies
versioned in source control, peer-reviewed in PRs, and tested in CI so a violation fails the build
before shipping: the governed-and-governing pattern applied to a spec file.

## 4. Compare

| Approach | Effort | Main risk | Source |
| --- | --- | --- | --- |
| A — Governed MD, prose-governing | ~0 (exists) | "govern" is advisory; matrix goes stale | Kong (cited) |
| B — Executable manifest | medium | stub tests fake "met"; lockstep upkeep | Wikipedia: Specification by example (cited) |
| C — Full RTM artifact | medium–high | over-ceremony for a PoC; link rot | Atlassian RTM (cited) |
| D — Hybrid MD + thin CI matrix | low–medium | dual AC lists diverge (mitigate: generate) | Wiz: Compliance as Code (cited) |

## 5. Recommendation

**Adopt D.** It satisfies the user's exact ask — one separate top-level file that is *both*
governed and governing — with the least PoC overhead: `/REQUIREMENTS.md` already provides the
governed half; D adds only a thin, generated status matrix enforced in CI and in the acceptance
phase so "govern" stops being advisory. It keeps the human-readable spec central (unlike C's
heavier tagging) while borrowing B's "drift fails the build" guarantee without B's full executable
burden. **Time-box impact:** small — the spec file needs no rewrite; the only new work is a mapper
that turns test results into the met/partial/missing matrix, folded into the existing
pytest/vitest/Playwright gates (AC18) during implement. No scope change to AC1–AC18, so no
version bump of `REQUIREMENTS.md` is triggered by this decision.

## 6. Decision

Proceed with **D**. Next: `/oneshot-poc:plan` carries the thin-matrix mapper into the build plan
as part of the acceptance/CI wiring (under AC18), with `/REQUIREMENTS.md` remaining the single
governed, governing root file.
