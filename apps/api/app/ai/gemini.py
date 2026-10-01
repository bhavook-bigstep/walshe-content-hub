"""Google Gemini provider (AC16). Key from env; HTTP mocked in tests."""
from __future__ import annotations

import httpx

from app.ai.base import AIProvider, AIResponse

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        super().__init__(model)
        self._api_key = api_key  # referenced, never logged (Contract 2)

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        resp = httpx.post(
            _ENDPOINT.format(model=self.model),
            params={"key": self._api_key},
            headers={"content-type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts)
        return AIResponse(text=text, provider=self.name, model=self.model)
