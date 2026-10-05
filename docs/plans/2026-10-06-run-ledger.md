# Run ledger — Agent workspace: Catalog + Collections (2026-10-06)

Charter: `docs/plans/2026-10-06-agent-workspace-charter.md` (v1.0). Loop: `/oneshot-poc:run`.
Authoritative state of the build. Outer/inner iterations, what was tried, acceptance status.

## Acceptance items (from the charter)
| # | Item | Status |
|---|---|---|
| A1 | Catalog is search/query library; primary action = Save to collection; "Add to composition" removed | pending |
| A2 | Save = validated entry reference (reject non-visible/expired) | pending |
| A3 | Collection detail view: see saved entries' media, remove item, rename | pending |
| A4 | Collections resolve live (drop/flag expired/deleted; accurate counts) | pending |
| A5 | Studio: new project from a collection; media = collection + local + AI only | pending |
| A6 | Templates hover → Preview + Use (no open-on-click) | pending |
| A7 | Sidebar order: Overview·Catalog·Collections·Templates·Design Studio·Projects·Brand kit·Social·Engagement | pending |
| A8 | Catalog + Collections redesigned; make verify green | pending |
| A9 | Clicking an entry (catalog or collection) opens an item-detail modal | pending |

## Iterations
- **Outer 1 / Plan** — in progress. Approach: BE first (collection resolve + save-validation +
  project-from-collection), then client fns + types, then FE redesign (catalog, collections,
  entry modal, templates hover, studio new-from-collection), then sidebar order, then tests +
  REQUIREMENTS, then `make verify`.

## Decisions / learnings
- (append as the build proceeds)
