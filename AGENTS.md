# AGENTS.md — the compound loop

How to run work in this repo. `CLAUDE.md` says WHY; the `.claude/rules/` say WHAT; this file
says how the loop runs and where the approval gates are.

## The loop

**BRAINSTORM → PLAN → IMPLEMENT → REVIEW → COMPOUND.** One hands-off pass over a goal is
`/oneshot-poc:run <goal>`. The phases are also available individually:

| Phase | Command | Produces |
| --- | --- | --- |
| Scope QA | `/oneshot-poc:scope` | a provenance-tagged requirements charter → `REQUIREMENTS.md` (always) |
| Phase plan | `/oneshot-poc:phases` | requirements split into ordered slices → the run ledger |
| Brainstorm | `/oneshot-poc:brainstorm` | 2–4 cited approaches → `docs/brainstorms/` |
| Plan | `/oneshot-poc:plan` | a concrete plan → `docs/plans/` |
| Implement | `/oneshot-poc:implement` | code + tests, gates passing |
| Review | `/oneshot-poc:review` | parallel agent review, classified findings |
| Compound | `/oneshot-poc:compound` | a solution doc → `docs/solutions/` |
| Ship | `/oneshot-poc:create-pr` | a PR (explicit opt-in only) |

## Intake shape

Before non-trivial work, restate the request: **Goal · Inputs · Method · Output · Constraints.**
If a field is genuinely unclear and changes scope, ask one question with a recommended default;
otherwise assume, state the assumption, and proceed.

## Approval gates (hard rules)

- **Never commit, push, or open a PR without explicit user approval.** A hands-off `/oneshot-poc:run`
  may commit to a *local feature branch*, but never pushes or opens a PR.
- **Never send anything outward** (email, message, deploy) unattended.
- Quality gates (lint/type/tests) must pass before review; report real output, never fake a pass.

## Review

`/oneshot-poc:review` spawns these agents in parallel (include one only if its area changed):
`learnings-researcher`, `code-quality-reviewer`, `architecture-reviewer`, `test-reviewer`,
`security-reviewer`. Findings are classified **P1** (blocker) / **P2** (should-fix) / **P3**
(nice-to-have), each with `file:line` evidence.

## Compound

After solving something non-trivial, `/oneshot-poc:compound` writes `docs/solutions/<category>/<slug>.md`
(the investigation path, not just the fix) and updates `docs/solutions/INDEX.md`. Recurring
failure modes get promoted into `.claude/rules/critical-patterns.md`.
