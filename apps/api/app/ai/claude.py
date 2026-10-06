"""Anthropic Claude provider (AC16). Key from env; HTTP mocked in tests, never called live there."""

from __future__ import annotations

from collections.abc import Iterator

import httpx

from app.ai.base import AIProvider, AIResponse, ChatMessage, sse_data

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
        return self._parse(resp)

    def stream_chat(
        self, system: str, messages: list[ChatMessage], *, max_tokens: int = 512
    ) -> Iterator[str]:
        # The system block is marked cacheable so repeat turns reuse the stable prefix (AC65).
        with httpx.stream(
            "POST",
            _ENDPOINT,
            headers={
                "x-api-key": self._api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "stream": True,
                "system": [
                    {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
                ],
                "messages": [{"role": m.role, "content": m.text} for m in messages],
            },
            timeout=30.0,
        ) as resp:
            resp.raise_for_status()
            for event in sse_data(resp):
                delta = event.get("delta") or {}
                if event.get("type") == "content_block_delta" and delta.get("text"):
                    yield delta["text"]

    def _parse(self, resp: httpx.Response) -> AIResponse:
        resp.raise_for_status()
        data = resp.json()
        text = "".join(block.get("text", "") for block in data.get("content", []))
        return AIResponse(text=text, provider=self.name, model=self.model)
