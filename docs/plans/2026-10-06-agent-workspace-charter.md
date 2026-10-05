# Requirements charter — Agent workspace: Catalog + Collections (accurate + redesigned)

**Date:** 2026-10-06 · **Version:** 1.0 · **Source:** `/oneshot-poc:run "make the catalog,
collection work accurately and redesign the UI for both"` + the user's detailed flow (this is the
governing scope; `/REQUIREMENTS.md` gets new ACs for the testable items).

## The flow (as the user described it)

The **Catalog** is a giant **library** of items (text / image / video) that come from the entries
content providers publish. The agent **searches/queries** the catalog and **saves references** to
entries into **Collections** — references only, never copies (the server serves the media from its
own storage; agents can't edit it). **Collections** let the agent see the saved items again and
**remove** them. The **Design Studio** builds a **Project from a Collection**: a new project is
started from a chosen collection, and the only media usable in it is **the collection's media +
local uploads + AI-generated media**. **Templates** keep working as today, but a template now shows
**Preview** and **Use** on hover instead of opening directly on click. Sidebar order changes.

## Decisions (charter rows)

| # | Decision | Reason | Provenance |
|---|---|---|---|
| D1 | **Catalog is a search/query library.** Primary card action = **Save to collection**. Remove the dead-ended "Add to composition" (local-only, studio ignored it). | The catalog's job is browse + save references, not building compositions. | [explicit] |
| D2 | **Save = a reference** (entry id) into a collection — never a media copy. Only **visible** entries can be saved; expired/hidden/deleted are rejected. | User: "save the reference… not storing the media." Accuracy. | [explicit] |
| D3 | **Collections get a detail view**: open a collection → see its saved entries' media (text/image/video), **remove** individual items, rename. | User: "items stored can be seen again and removing can be performed." | [explicit] |
| D4 | **Collections resolve live** against the catalog: expired/withdrawn/deleted entries are flagged or dropped, and counts reflect resolved items (like Projects' `/resolved`). | "Work accurately" — stale ids today. | [inferred] |
| D5 | **Design Studio: a new project is started from a Collection.** The project's usable media = that collection's media **+ local uploads + AI-generated** media only. Existing projects open as today. | User: "Studio will need a collection to create a new project; only collection/local/LLM media usable." | [explicit] |
| D6 | **Templates: hover → Preview + Use.** Preview opens a read-only preview; Use opens it in the studio. (No more open-on-click.) | User. | [explicit] |
| D7 | **Agent sidebar order:** Overview · Catalog · Collections · Templates · Design Studio · Projects · Brand kit · Social · Engagement. | User-specified order. | [explicit] |
| D8 | **Redesign both Catalog + Collections** within the existing walshe design system (tokens/classes), responsive, keeping accessibility + e2e hooks. | Cohesion; keep tests green. | [inferred] |
| D9 | **Clicking an entry opens its items in a detail modal** ("window box") — the entry's text/image/video items, read-only. Same modal in the **Catalog** and inside a **Collection**. | User: "when any entry is clicked its items should appear in a new window box; same in collection." | [explicit – feedback] |

## Acceptance checklist (the contract Phase F verifies)

1. **Catalog library + save:** the agent catalog is search/query-first (keyword + location + season
   + type); each card's primary action is **Save to collection**; the old "Add to composition"
   path is gone. (redesigned UI)
2. **Reference + validation:** saving stores an entry reference; saving a non-visible/expired entry
   is rejected by the API.
3. **Collection detail:** opening a collection shows its saved entries with their media (text/image
   /video) and a **remove-item** control; rename works.
4. **Live resolve:** a collection resolves against the live catalog — an expired/withdrawn/deleted
   entry is dropped or clearly flagged, and the count reflects resolved items (not raw ids).
5. **Studio from collection:** creating a **new** project requires choosing a collection; the new
   project is scoped to it, and the studio media picker offers only **collection + local + AI**
   media.
6. **Templates hover:** a template shows **Preview** and **Use** on hover; Preview opens a preview,
   Use opens it in the studio; a bare click no longer opens it directly.
7. **Sidebar order:** the agent nav is Overview · Catalog · Collections · Templates · Design Studio
   · Projects · Brand kit · Social · Engagement.
8. **Redesigned, cohesive, green:** Catalog + Collections are visibly redesigned, responsive, and
   `make verify` stays green (existing a11y/e2e hooks preserved).
9. **Entry detail modal:** clicking a catalog entry opens a modal showing its items (text/image/
   video); clicking an entry inside a collection opens the same modal.

## Out of scope (PoC)
- Sharing collections between agents; collaborative editing.
- Editing provider media (agents only reference it).
- Changing provider-side catalog authoring.
