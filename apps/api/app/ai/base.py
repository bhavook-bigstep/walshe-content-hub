"""The single AI interface every provider implements (AC16)."""

from __future__ import annotations

import abc
import json
from collections.abc import Iterator
from dataclasses import dataclass

import httpx

from app.ai.embedding import deterministic_embedding


@dataclass(frozen=True)
class ChatMessage:
    """One turn for :meth:`AIProvider.stream_chat` (``role`` is ``user`` or ``assistant``)."""

    role: str
    text: str


@dataclass(frozen=True)
class AIResponse:
    text: str
    provider: str
    model: str


class AIProvider(abc.ABC):
    """One interface, selected by config. Builder (AC10) + retrieval (AC44) use only this type."""

    name: str = "base"

    def __init__(self, model: str) -> None:
        self.model = model

    @abc.abstractmethod
    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        """Return a completion for ``prompt``."""
        raise NotImplementedError

    def stream_chat(
        self, system: str, messages: list[ChatMessage], *, max_tokens: int = 512
    ) -> Iterator[str]:
        """Stream a multi-turn reply as text chunks, with a separate system prompt (AC65).

        Default = flatten into one prompt and yield :meth:`complete` once, so the stub and any
        provider without a native override still work. Real providers send ``system`` first and
        unchanged so their prefix caching applies.
        """
        turns = "\n\n".join(f"{m.role.upper()}: {m.text}" for m in messages)
        yield self.complete(f"{system}\n\n{turns}", max_tokens=max_tokens).text

    def embed(self, text: str) -> list[float]:
        """Return an embedding vector for ``text`` (AC44).

        Default = the deterministic offline embedding, so every provider has a working, reproducible
        embedding with no key. A provider with a real embedding model may override this.
        """
        return deterministic_embedding(text)


def sse_data(resp: httpx.Response) -> Iterator[dict]:
    """Yield each JSON ``data:`` payload of a server-sent-events response."""
    for line in resp.iter_lines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload and payload != "[DONE]":
                yield json.loads(payload)
