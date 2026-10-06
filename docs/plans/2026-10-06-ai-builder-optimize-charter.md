# Charter — Structured Workspace (grounding the Design Studio input)

**Date:** 2026-10-06 · **Version:** 2.0 (supersedes the optimize-loop scope — that's deferred).
Source: `/oneshot-poc:run` Design Studio, "basics first". Backlog: vision doc §5/§16.

## Goal
Make a Design Studio project a **single structured Workspace object** so (a) autosave is just
"save the whole workspace" and (b) the builder-mode LLM reads one object for all its inputs.

## The Workspace shape (the contract)
Stored on the project (`Composition.workspace`, JSON); references only, media resolved live.
```jsonc
{
  "metadata": { "name", "format", "width", "height", "version" },
  "reference_content": {
    "collections": [ { "collection_id", "name", "entries": [ {"entry_id","title","type"} ] } ],
    "uploads":    [ { "asset_id","object_key","kind","content_type","title","source":"local" } ],
    "generated":  [ { "asset_id","object_key","kind","content_type","title","source":"agent" } ]
  },
  "scenes": [ /* DesignDoc scenes */ ]
}
```

## Decisions
| # | Decision | Provenance |
|---|---|---|
| D1 | Project stores one `workspace` JSON = `{metadata, reference_content, scenes}`. | [explicit] |
| D2 | `reference_content` holds **references** (ids + object_key + labels), never media copies; a **resolve** endpoint expands them live (entries→items, assets→urls). | [explicit] |
| D3 | `GET /me/projects/{id}/workspace` → resolved workspace; `PUT /me/projects/{id}/workspace` → autosave the whole object (validated, bumps `metadata.version`). | [explicit] |
| D4 | Creating a project from a collection seeds `reference_content.collections=[that collection]`. Adding more collections/uploads/generated = appending entries (saved via the whole-workspace PUT). | [explicit] |
| D5 | `item_ids` stays as a **derived** cache (entry ids from collections) so existing resolve/preflight keep working; old projects migrate on read. | [inferred] |
| D6 | The studio loads the resolved workspace → builder grounding + placeable media (collection items + uploads + generated), keyed by `object_key`. | [explicit] |

## Acceptance checklist
1. A project stores a structured workspace; `GET …/workspace` returns it **resolved** (collections'
   entries with their items; uploads/generated with object_keys); `PUT …/workspace` saves the whole
   object and bumps the version. Agent-only, ownership-scoped.
2. Creating a project from a collection seeds `reference_content.collections` with that collection;
   an old project (no workspace) migrates on read from its `item_ids`/`design`.
3. The studio reads the resolved workspace as its input (builder grounding + placeable media from
   collection + uploads + generated) and autosaves the workspace.
4. `make verify` stays green; resolution drops stale/expired references.

## Deferred (next increments)
Optimize/variants loop; richer builder output; constraint layout; multi-format; versioned history
(we add a version counter now as the seam).
