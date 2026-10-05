"""Deterministic stub provider (AC16 fallback + Contract 4).

Produces a stable, prompt-derived completion with no network and no key, so the demo runs and
tests are reproducible when no provider key is present.
"""

from __future__ import annotations

import hashlib

from app.ai.base import AIProvider, AIResponse


class StubProvider(AIProvider):
    name = "stub"

    def __init__(self, model: str = "stub-1") -> None:
        super().__init__(model)

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        digest = hashlib.sha256(prompt.encode()).hexdigest()[:12]
        text = f"[stub:{digest}] {prompt.strip()[:max_tokens]}"
        return AIResponse(text=text, provider=self.name, model=self.model)
