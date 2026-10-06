# Run ledger — Agent workspace: Catalog + Collections (2026-10-06)

Charter: `docs/plans/2026-10-06-agent-workspace-charter.md` (v1.0). Loop: `/oneshot-poc:run`.
Authoritative state of the build. Outer/inner iterations, what was tried, acceptance status.

## Acceptance items (from the charter)
| # | Item | Status |
|---|---|---|
| A1 | Catalog is search/query library; primary action = Save to collection; "Add to composition" removed | met (AC59) |
| A2 | Save = validated entry reference (reject non-visible/expired) | met (AC59) |
| A3 | Collection detail view: see saved entries' media, remove item, rename | met (AC60) |
| A4 | Collections resolve live (drop/flag expired/deleted; accurate counts) | met (AC60) |
| A5 | Studio: new project from a collection; media = collection + local + AI only | met (AC63) |
| A6 | Templates hover → Preview + Use (no open-on-click) | met (AC62) |
| A7 | Sidebar order: Overview·Catalog·Collections·Templates·Design Studio·Projects·Brand kit·Social·Engagement | met |
| A8 | Catalog + Collections redesigned; make verify green | met |
| A9 | Clicking an entry (catalog or collection) opens an item-detail modal | met (AC61) |

## Iterations
- **Outer 1 / Plan** — in progress. Approach: BE first (collection resolve + save-validation +
  project-from-collection), then client fns + types, then FE redesign (catalog, collections,
  entry modal, templates hover, studio new-from-collection), then sidebar order, then tests +
  REQUIREMENTS, then `make verify`.

## Decisions / learnings
- AC59–63 landed (catalog library, collections resolve + detail, entry modal, templates hover,
  studio project-from-collection). REQUIREMENTS 2.21.0.

---

# Follow-on increment — Structured Workspace (AC64)

Charter: `docs/plans/2026-10-06-ai-builder-optimize-charter.md` (v2.0). "Basics first": ground the
Design Studio's input as one structured object before any multi-iteration builder loop.

## Acceptance items
| # | Item | Status |
|---|---|---|
| W1 | Project stores one structured `workspace` = {metadata, reference_content, scenes}; references only | met (AC64) |
| W2 | `GET /me/projects/{id}/workspace` returns it resolved (collections' entries w/ items; uploads/generated w/ keys) | met (AC64) |
| W3 | `PUT /me/projects/{id}/workspace` autosaves whole object; validates refs; drops stale; bumps version | met (AC64) |
| W4 | Create-from-collection seeds reference_content.collections; legacy project migrates on read | met (AC64) |
| W5 | Studio reads resolved workspace as single input (grounding + placeable media) and autosaves it | met (AC64) |
| W6 | item_ids/design kept as derived/compat view; `make verify` green | in progress |

## Iterations
- **Outer 1 / Implement** — BE: `workspace` JSON column on Composition; Workspace schemas
  (metadata/reference_content/scenes + resolved variants); router helpers (`_seed_workspace`,
  `_migrate_workspace`, `_resolve_workspace`, `_ids_from_ws`, `_owned_assets`) + GET/PUT endpoints;
  `create_project` seeds from `collection_id`. Client: `getWorkspace`/`saveWorkspace` + types;
  `createProject` carries `collection_id`. FE: collections "Open in Design Studio" passes
  `collection_id`; studio media + autosave now workspace-driven; MediaDialog appends
  uploads/generated to the workspace and autosaves. Tests: 3 api tests (seed-from-collection,
  PUT validation + version bump, legacy migration). Governance: AC64 in REQUIREMENTS 2.22.0 +
  manifest; sync PASS (64 ACs). `make verify` running.
