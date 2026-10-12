"""AI-agent tool surface — the ONE public, access-token-protected API group that only the AI agent
uses (the in-app Builder or an external MCP host), clubbed under a single ``/ai-agent`` prefix and
one Swagger tag.

Why a wrapper: these endpoints are a distinct surface from the product's human-facing API. Manual
Studio editing never calls them — it runs the pure TS ops in the browser and autosaves the whole
workspace via ``/me/projects/{id}/workspace``. The agent, which can't reach the browser's in-memory
ops, drives the same op core through HTTP here. Grouping them makes the agent's whole contract
discoverable in one place at ``/docs``.

It mounts the existing routers unchanged, so each keeps its own logic and tests:
- ``/ai-agent/builder/*``   — prompt + grounded items → a design (AC10) / creative plan.
- ``/ai-agent/studio/ops/*`` — the grounded studio-ops tool catalog + apply engine facade.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers import builder, studio

router = APIRouter(prefix="/ai-agent", tags=["Agent Tools"])

router.include_router(builder.router)
router.include_router(studio.router)
