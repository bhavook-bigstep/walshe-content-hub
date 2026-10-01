# Testing Rules

## HARD BLOCKS (reject if violated)

1. **New logic ships with tests** — any non-trivial function, stage, or rule needs a test.
   Untested code is a regression waiting to happen.
2. **No tests on real secrets/PII** — tests use **synthetic** fixtures only. Never assert on
   real records, identifiers, keys, or live model/service responses. Tests are deterministic
   and hermetic.
3. **No skipped / `.only` / xfail-without-reason tests committed** — they silently reduce coverage.

## REQUIRED PATTERNS

- Use the project's test runner with fixtures for inputs, configs, and state.
- **Mock the boundaries** — network, storage, clock, randomness, external services — in unit
  tests. Keep a small set of integration tests over synthetic fixtures.
- **Cover the risk paths first:** exception/error handling, edge cases (empty, tie, boundary),
  and any scoring/threshold/state-machine logic.
- **Reproducibility test:** same inputs + config + seed → identical output.
- **Coverage target:** ~90% on changed lines; prioritise exception handling and decision logic.

## SUPPRESSIONS (do NOT flag)

- Generated code without hand-written logic.
- Thin pass-through adapters with no branching.
