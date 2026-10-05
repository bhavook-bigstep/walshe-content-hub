# Requirements Charter — Sound agentic architecture (round 4)

**Date:** 2026-10-04 · **Charter version:** 1.0 · **Governs:** AC41–AC45 in `/REQUIREMENTS.md`
(promoted incrementally, one increment per set, as each is built).

**Source:** a reference architecture the user supplied (multi-tenant AI creative platform: agent +
tools + knowledge domains + RAG + Creative Plan IR + validation/governance + model gateway +
observability). This epic evolves the existing assistant (AC38–AC40) toward that architecture, kept
PoC-appropriate and translated to our *verified destination-content* domain.

## What we already satisfy (do not rebuild)
LLM-as-planner-not-source-of-truth; agent+tools; retrieval enforces authorization in code
(`app/services/visibility.py`), never the LLM; validation layer outside the LLM (preflight AC34,
blocklist AC36, approval AC35, grounding guard); model gateway (`app/ai/factory.py`); multi-tenancy
from day one; assets carry approved/brand-safe/usage metadata.

## A2 — Scope decisions

| # | Decision | Provenance | Reason |
| --- | --- | --- | --- |
| D1 | Build **all three layers, phased**, with a check-in after each: **(1) Creative Plan IR + validation → (2) knowledge domains + pgvector hybrid RAG → (3) observability/tracing**. | `[explicit]` | user chose "All three, phased". |
| D2 | **Asset selection only — no generative image generation.** AI composes from the approved asset library + templates; any generative imagery is out of scope this epic. | `[explicit]` | user chose "Asset selection only"; protects the verified-content promise (Contract 1). |
| D3 | **Full pgvector + rerank** for semantic retrieval (increment 2), on **Postgres** (the existing `infra/docker-compose.yml`). | `[explicit]` | user chose "Full pgvector + rerank now". |
| D4 | Retrieval sits behind one `RetrievalBackend` interface with **two implementations**: pgvector (Postgres, real dev/prod) and a **deterministic in-Python cosine fallback** (SQLite + hermetic tests). Embeddings via the model gateway (real model with a key; deterministic stub offline). A Postgres-gated integration test covers the pgvector path. | `[inferred]` | reconciles "full pgvector" (D3) with Contract 4 (hermetic, deterministic SQLite tests). Flagged to the user at the increment-2 check-in. |
| D5 | **LLM is the planner, never the source of truth**: knowledge, permissions, brand rules, claim validation stay in code. The Creative Plan IR is the contract between agent, generators and validators. | `[requirement]` | the reference doc's §16 principle; already our stance. |
| D6 | Keep the **modular monolith** (clean seams in `app/ai`, `app/services`, `app/agents`), not microservices; keep a **single orchestrator** (defer multi-agent); keep the **AI provider abstraction** as the model gateway. | `[inferred]` | the doc itself says don't start with microservices/multi-agent; matches our architecture. |
| D7 | **Observability** (increment 3): persist agent-run traces (intent, tools, model, tokens/latency, outcome), admin-viewable, AND wire **LangSmith** tracing over the LangGraph agent loop + creative plan + provider calls ("trace everything completely"). LangSmith is **env-gated and off by default** (no key → no-op, no egress) so demos/tests stay hermetic (Contracts 2+4); enabling it is an operator opt-in that sends approved prompt/response content (no secrets/PII) to LangSmith. | `[explicit – feedback]` | user: "also add langsmith for tracing the Agent loop and everything completely". |

## Increments (AC41–AC45)

### Increment 1 — Creative Plan IR + validation  *(building now)*
- **AC41 — Creative Plan IR**: a structured `CreativePlan` (brief → message → creative → copy +
  sources) is the contract. The creative pipeline runs **Brief → Plan → Copy → Visual(asset
  selection) → Validate**, grounded only in the agent's selected, visible, approved items. Proof:
  pytest asserts a plan is built from visible items (scoped) and serialises the IR; a hidden item is
  refused.
- **AC42 — Claim-grounding validation**: every factual claim in the plan's copy must trace to an
  approved source field of a selected item; ungrounded claims are flagged with the evidence gap
  named, and the plan is marked not-ready. Proof: pytest asserts an ungrounded claim (from a fake
  provider) is flagged while a grounded plan passes, with evidence links.

### Increment 2 — Knowledge domains + pgvector hybrid RAG
- **AC43 — Knowledge domains + query classifier**: retrieval routes to Product/Brand/Marketing/Asset
  domains through a controlled, tenant/permission-scoped layer (the choke-point still enforces auth).
- **AC44 — Hybrid semantic retrieval + rerank**: pgvector + keyword, reranked; embeddings via the
  gateway (stub offline); exposed as the assistant's search tool. `RetrievalBackend` per D4.

### Increment 3 — Observability
- **AC45 — Agent-run tracing**: each agent/creative run records intent, tools called, model,
  tokens/latency and outcome; admin-viewable and exportable; **plus LangSmith tracing** over the
  LangGraph loop + creative plan + provider calls, env-gated and off by default (no key → no-op, no
  egress; hermetic tests unaffected).

## Out of scope this epic
Generative image/video models (D2) · multi-agent Creative Director (defer) · real reach/social
integration (already deferred) · Langfuse service wiring (interface only) · microservice split.

## Acceptance checklist — Increment 1 (promoted now)
- **AC41 — Creative Plan IR** (proof as above).
- **AC42 — Claim-grounding validation** (proof as above).
All prior ACs (AC1–AC40) stay green. Deterministic via stub provider + injectable clock; grounded +
tenant-scoped through `app/services/visibility.py`. Branch `feat/content-hub-poc`; no push.
