# Code Review Checklist

## Verdict
Every review ends with exactly one: **APPROVED** · **APPROVED_WITH_COMMENTS** ·
**CHANGES_REQUIRED**.

## Priority
| Priority | Meaning |
| --- | --- |
| **P1** | Blocker — broken build, security hole, data loss, contract breach, unexplained output |
| **P2** | Should fix — correctness, performance, weak/missing test |
| **P3** | Nice to have — style, naming, minor cleanup |

## Finding format
```
### [P1] <short title>
**File:** path/to/file:line
**Issue:** what is wrong and what it causes.
**Fix:** the specific change (with code where useful).
```

## Checklist
1. **Correctness** — does it do what the plan/spec says? Edge cases handled?
2. **Contracts** — honours the invariants in `CLAUDE.md`? No one-way doors without a guard.
3. **Security** — no secrets, injection, unsafe deserialization, uncontrolled egress; input validated.
4. **Boundaries** — module/library boundaries respected; no cross-layer shortcuts.
5. **Reproducibility** — deterministic where required; config-driven; no hidden state.
6. **Tests** — new logic covered; exception + decision paths tested; hermetic, synthetic fixtures.
7. **Simplicity** — YAGNI; no over-building beyond scope; no duplication or dead code.

If clean: state "No blocking issues found" and the verdict.
