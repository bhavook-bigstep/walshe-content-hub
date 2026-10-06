"""Google Gemini provider (AC16). Key from env; HTTP mocked in tests."""

from __future__ import annotations

from collections.abc import Iterator

import httpx

from app.ai.base import AIProvider, AIResponse, ChatMessage, sse_data

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_STREAM_ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
)


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
            timeout=60.0,
        )
        return self._parse(resp)

    def stream_chat(
        self, system: str, messages: list[ChatMessage], *, max_tokens: int = 512
    ) -> Iterator[str]:
        # systemInstruction is the stable prefix → Gemini's implicit caching reuses it (AC65).
        config: dict = {"maxOutputTokens": max_tokens}
        if "2.5-flash" in self.model:
            # 2.5 Flash "thinks" by default; those tokens eat maxOutputTokens and add latency.
            config["thinkingConfig"] = {"thinkingBudget": 0}
        with httpx.stream(
            "POST",
            _STREAM_ENDPOINT.format(model=self.model),
            params={"key": self._api_key, "alt": "sse"},
            headers={"content-type": "application/json"},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [
                    {
                        "role": "model" if m.role == "assistant" else "user",
                        "parts": [{"text": m.text}],
                    }
                    for m in messages
                ],
                "generationConfig": config,
            },
            timeout=30.0,
        ) as resp:
            resp.raise_for_status()
            for event in sse_data(resp):
                for cand in event.get("candidates", [])[:1]:
                    for part in cand.get("content", {}).get("parts", []):
                        if part.get("text"):
                            yield part["text"]

    def _parse(self, resp: httpx.Response) -> AIResponse:
        resp.raise_for_status()
        data = resp.json()
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(part.get("text", "") for part in parts)
        return AIResponse(text=text, provider=self.name, model=self.model)
