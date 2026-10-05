# Requirements Charter — Profiles, dual workspaces & role-based registration

**Date:** 2026-10-02 · **Charter version:** 1.0 · **Governs:** new acceptance items AC25–AC29 in
`/REQUIREMENTS.md` (to be promoted on confirmation). Extends the confirmed v2.1.0 spec.

## A2 — Scope decisions

| # | Decision | Provenance | Reason |
| --- | --- | --- | --- |
| D1 | Registration opens with a **role choice** (Travel Agent · Tourism board / Content Provider). | `[explicit]` | "the page will let us first decide which way we want to register as". |
| D2 | **Agent** self-register → account created + **signed in immediately**. | `[explicit]` | "agent being registered right away". |
| D3 | **Provider** self-register (email, password, organization, contact) → **pending account**; on login they see an **"application under review — our team will contact you"** holding screen; a **Super Admin approval** unlocks the provider workspace. | `[explicit]` | provider "entering a queue where the team will contact them to confirm and onboard" + chosen option. |
| D4 | **Rich profile**: a profile/settings page (display name, avatar, bio, preferences) reached from a **top-bar profile menu**; the workspace greets by name + shows the avatar; **providers get an organization page** (logo, blurb, markets served, verification badge). | `[explicit]` | chose "Rich profile" / "give the profile its own character". |
| D5 | **Fixed-viewport workspace**: no document scroll — content that must scroll is **bounded inside its own div and scrolls there**; everything is visible at a glance or behind a menu/dialog; nothing overflows screen height/width. Applies to **both** workspaces. | `[explicit]` | "keep the whole UI unscrollable … bounded in the Div … nothing should overflow below the screen height and width … rich feel". |
| D6 | **Agent** workspace features: **Saved projects · Collections · Brand kit · Templates**. | `[explicit]` | all four selected. |
| D7 | **Provider** workspace features: **Media library · Team members · Content performance**. | `[explicit]` | selected. |
| D8 | **Rich, highly-structured catalog**: a varied set of tourism-item content types + **custom sections** when content doesn't fit a prebuilt template; a structured **tourism "inventory"**; the schema is explicit/typed so **AI agents can crawl it** and find relevant data fast. | `[explicit]` | "rich variety of content … add custom section … inventory … keep the content highly structured because AI agents will be crawling". |
| D9 | The public landing page (`/`) stays **scrollable** (marketing); the fixed-viewport rule governs the **signed-in** workspaces only. | `[inferred]` | the no-scroll rule is about the working UI; a marketing hero is scroll-by-nature. |
| D10 | Build is **phased** across ⏸G checkpoints (foundation first, then the role-feature depth). | `[inferred]` | scope is large; phasing keeps each verify gate a usable slice, not a half-built everything. |

## Acceptance checklist (new ACs)

- **AC25 — Role-based registration & provider queue.** `/register` presents a role choice. Agent →
  account + immediate sign-in. Provider → unapproved account + an "under review" holding screen with
  no workspace access until a Super Admin approves; approval unlocks it. API-enforced; no role
  escalation (self-register can't mint admin; provider can't self-approve).
- **AC26 — Fixed-viewport workspace.** Every signed-in page fits the viewport with **no document
  scroll**; overflowing content scrolls inside bounded regions; no page overflow at desktop or
  mobile, both roles. (Proof: Playwright asserts `scrollHeight ≈ clientHeight` and no horizontal
  overflow on key workspace screens.)
- **AC27 — Rich profiles.** A profile/settings page (display name, avatar, bio, preferences) from a
  top-bar profile menu; workspace greets by name + shows avatar; providers have an organization page
  (logo, blurb, markets, verification badge).
- **AC28 — Agent workspace features.** Saved projects (persist/reopen Studio compositions),
  Collections (save catalog items), Brand kit (logo/colours/contact reused in Personalise),
  Templates (start from presets).
- **AC29 — Provider structured inventory.** A structured tourism-item inventory with a rich set of
  content types and **custom sections** for anything outside the templates; a media library; team
  members; a content-performance view. Schema explicit/typed for AI-agent crawling.

## Build order (each phase ends at a ⏸G checkpoint)

- **Phase 1 (this cycle → ⏸G): the foundation.** AC25 (role-choice registration + provider queue /
  holding / approve), AC26 (fixed-viewport shell across both workspaces), AC27 (rich profiles +
  provider org page). Cohesive, demoable, de-risks the global layout + account model.
- **Phase 2 (next cycle): the provider depth.** AC29 — structured inventory, custom sections, media
  library, team members, performance (data-model-heavy).
- **Phase 3 (next cycle): the agent depth.** AC28 — saved projects, collections, brand kit, templates.

All prior ACs (AC1–AC24) stay green throughout. Local branch `feat/content-hub-poc`; no push/PR.
