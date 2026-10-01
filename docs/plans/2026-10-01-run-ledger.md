# Run ledger — Walsh Content Hub PoC

Durable state for a `/oneshot-poc:run`. **Every phase reads this first and appends to it when
done.** Content-free: status and decisions only, never secrets/PII.

- **Governing spec:** `/REQUIREMENTS.md` (v1.0.0, ACTIVE) — the acceptance contract the loop verifies against · **Charter (scoping record):** `docs/plans/2026-10-01-requirements-charter.md` (v2) · **Branch:** `feat/content-hub-poc`
- **Current phase:** `B` (entering autonomous build loop)
- **Outer loop:** `0/3` · **Inner loop:** `0/2`

## Requirement status (the acceptance checklist)

| # | Requirement | Status | Evidence / note |
|---|-------------|--------|-----------------|
| AC1 | 3-role login + RBAC | todo | |
| AC2 | Super Admin: users/tenants + approve provider | todo | |
| AC3 | Provider: create catalog entries (event/place/opportunity + offer/itinerary) | todo | |
| AC4 | Provider: upload image → MinIO → served | todo | |
| AC5 | Provider: mark brand-safe + set access | todo | |
| AC6 | Agents only see approved brand-safe entries (CONTRACT) | todo | |
| AC7 | Agent: browse/search/filter + compose | todo | |
| AC8 | Design Studio: pick format (social/story/pamphlet) | todo | |
| AC9 | Studio manual: text/shapes/bg + catalog images; multi-page | todo | |
| AC10 | Builder AI agent: generate/edit design from prompt+catalog | todo | |
| AC11 | Personalize: logo/contact/offer | todo | |
| AC12 | Export PNG + PDF + email HTML | todo | |
| AC13 | Rudimentary video MP4 (demo-video mechanism) | todo | |
| AC14 | Social: schedule/publish (simulated) | todo | |
| AC15 | Engagement dashboard (seeded metrics) | todo | |
| AC16 | AI provider abstraction (3 providers, env keys, mocked) | todo | |
| AC17 | docker compose up + seed script | todo | |
| AC18 | Tests pass (pytest + vitest + Playwright smoke) | todo | |

Priority tiers: **P1** = AC1,3,4,6,7,8,9,12,16,17,18 · **P2** = AC10,11,13 · **P3** = AC2,5,14,15.

## Iteration log

| When (phase) | What changed | Result |
|--------------|--------------|--------|
| A2 | Charter v2 confirmed; stack locked in CLAUDE.md; git repo + branch created | — |

## Open assumptions / deferrals
- No `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` in env → app uses **deterministic stub fallback** at runtime; real-provider paths are built + unit-tested with mocks.
- Social layer simulated (no real OAuth). Auth = simple email+password + role guards. Canvas = Fabric.js.
- Real assets added via the app (Provider catalog UI) after seeded placeholders.

## Blockers (if STUCK)
- (none yet)
