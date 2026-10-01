# Security Rules

## HARD BLOCKS (reject if violated)

1. **No secrets in code, logs, or committed config** — tokens, cloud credentials, API keys
   come from env or a secret manager. A committed secret outlives the commit.
2. **No uncontrolled data egress** — don't send data or prompts-from-data to external endpoints
   without a clear, approved reason. Default to in-boundary / controlled infrastructure.
3. **Never run untrusted active content** — don't execute macros, embedded scripts, or active
   content from inputs during processing. Parse inertly.
4. **No untrusted deserialization / injection** — no `pickle`/`eval`/`exec`/`yaml.load` on
   untrusted input; parameterise SQL; escape template/DOM output; validate file paths and URLs.
5. **No sensitive data (PII, credentials) in logs or error messages** — reference by id/location.

## REQUIRED PATTERNS

- **Least privilege:** scope access to exactly what the stage needs.
- **Key handling:** reference keys, never store them in the repo; rotate per policy.
- **Validate input at the boundary** (type, range, format) before it reaches logic.
- **Deployment parity:** the same controls apply in every environment — the boundary moves,
  the rules do not.

## SUPPRESSIONS (do NOT flag)

- Test fixtures with obviously fake keys/tokens (e.g. `test-key-xxxx`).
- Read-only introspection against a dev resource.
