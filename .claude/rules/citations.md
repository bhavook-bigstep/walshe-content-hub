# Citations & Sourcing Rules

Applies to every new idea, approach, fix, or non-obvious design suggestion — in
brainstorming, planning, reviews, and chat answers alike.

## HARD BLOCKS (reject if violated)

1. **Every proposed idea carries a source tag** — EITHER a real cited source OR the explicit
   "no source found" disclaimer. An idea with neither is a blocking failure.
2. **Actually web-search before claiming a source or its absence** — use `WebSearch` /
   `WebFetch`. Don't assert "no source found" without having searched, and don't assert a
   source from memory. If web tools are unavailable, say so.
3. **Never fabricate a citation** — no invented URLs, titles, authors, or dates. A made-up
   citation is worse than an honest disclaimer.

## REQUIRED PATTERNS

- **Citation format:** `Title — publisher/author — URL (accessed YYYY-MM-DD)`, then one line
  on how it supports the idea.
- **Disclaimer (verbatim):** **"No source found — this is an AI-generated idea."**
- **Prefer primary/authoritative sources** (official docs, standards/RFCs, peer-reviewed
  papers, the library's own repo) over aggregator blogs.
- **Match the claim to the source** — a source about X does not justify a claim about Y.
- **Scope:** cite novel or contestable claims (methods, trade-offs, "best practice",
  accuracy/perf/security claims). Trivial syntax or restating the request needs no citation.

## SUPPRESSIONS (do NOT flag)

- Statements about THIS repo's own code/contracts (cite `path:line` instead).
- Trivial language/framework syntax any reference would confirm.
