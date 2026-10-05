# Requirements Charter — Theming & workspace usability

**Date:** 2026-10-02 · **Charter version:** 1.0 · **Governs:** AC30–AC31 in `/REQUIREMENTS.md`.

## A2 — Scope decisions

| # | Decision | Provenance | Reason |
| --- | --- | --- | --- |
| D1 | **Light & dark themes across the ENTIRE app** — landing, auth, and the signed-in workspace. | `[explicit]` | chose "Entire app incl. landing". |
| D2 | Theme **follows the OS preference by default**, a **remembered toggle** (in the sidebar) overrides it, and there is **no flash** of the wrong theme on first paint. | `[explicit]` | chose "Follow system + remembered toggle". |
| D3 | Themes are **token-driven**: semantic design tokens (bg / surface / text / border / chrome / accent) swap per theme so every surface adapts from one place. The current dark look is preserved exactly as the dark theme. | `[inferred]` | the design must stay consistent + the dark theme is already tuned. |
| D4 | **Wire the agent features end-to-end**: "Add to collection" from the catalog, "Open in studio" for a saved project, "Use template" starts a design, and the **brand kit is applied when personalising**. | `[explicit]` | chose "Wire features end-to-end". |
| D5 | **Visual UI polish** across the workspace: spacing, empty/loading states, affordances and consistency so the feature pages feel finished. | `[explicit]` | chose "Visual UI polish". |
| D6 | Polish the **core browse → compose → publish flow** (Catalog · Design Studio · Social · Engagement). | `[explicit]` | chose the core-flow option. |

## Acceptance checklist (new ACs)

- **AC30 — Light & dark themes.** The whole app supports light and dark, token-driven; defaults to
  the OS preference; a remembered toggle (sidebar) overrides it; no flash of the wrong theme on
  load. Proof: a theme test asserts both palettes/tokens exist; Playwright toggles the theme in the
  workspace and asserts the document theme attribute + a surface colour change.
- **AC31 — Workspace usability.** Features are wired end-to-end — add-to-collection from the
  catalog, open-a-saved-project in the Studio, use-a-template to start a design, and the brand kit
  applied when personalising — with polished empty/loading states. Proof: pytest/Playwright for
  add-to-collection and loading a project/template into the Studio.

All prior ACs (AC1–AC29) stay green. Local branch `feat/content-hub-poc`; no push/PR.
