"""OpenAI provider (AC16). Key from env; HTTP mocked in tests."""

from __future__ import annotations

from collections.abc import Iterator

import httpx

from app.ai.base import AIProvider, AIResponse, ChatMessage, sse_data

_ENDPOINT = "https://api.openai.com/v1/chat/completions"


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        super().__init__(model)
        self._api_key = api_key  # referenced, never logged (Contract 2)

    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        resp = httpx.post(
            _ENDPOINT,
            headers={
                "authorization": f"Bearer {self._api_key}",
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
        # OpenAI caches long identical prefixes automatically; the system message leads (AC65).
        with httpx.stream(
            "POST",
            _ENDPOINT,
            headers={
                "authorization": f"Bearer {self._api_key}",
                "content-type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": max_tokens,
                "stream": True,
                "messages": [{"role": "system", "content": system}]
                + [{"role": m.role, "content": m.text} for m in messages],
            },
            timeout=30.0,
        ) as resp:
            resp.raise_for_status()
            for event in sse_data(resp):
                for choice in event.get("choices", [])[:1]:
                    text = (choice.get("delta") or {}).get("content")
                    if text:
                        yield text

    def _parse(self, resp: httpx.Response) -> AIResponse:
        resp.raise_for_status()
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return AIResponse(text=text, provider=self.name, model=self.model)
