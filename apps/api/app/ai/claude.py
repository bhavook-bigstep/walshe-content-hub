"""Anthropic Claude provider (AC16). Key from env; HTTP mocked in tests, never called live there."""
from __future__ import annotations

import httpx

from app.ai.base import AIProvider, AIResponse

_ENDPOINT = "https://api.anthropic.com/v1/messages"


class ClaudeProvider(AIProvider):
    name = "claude"

    def __init__(self, api_key: str, model: str = "claude-sonnet-5-5") -> None:
        super().__init__(model)
        self._api_key = api_key  # referenced, never logged (Contract 2)

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        resp = httpx.post(
            _ENDPOINT,
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        text = "".join(block.get("text", "") for block in data.get("content", []))
        return AIResponse(text=text, provider=self.name, model=self.model)
