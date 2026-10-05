"""The single AI interface every provider implements (AC16)."""

from __future__ import annotations

import abc
from dataclasses import dataclass

from app.ai.embedding import deterministic_embedding


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

    def embed(self, text: str) -> list[float]:
        """Return an embedding vector for ``text`` (AC44).

        Default = the deterministic offline embedding, so every provider has a working, reproducible
        embedding with no key. A provider with a real embedding model may override this.
        """
        return deterministic_embedding(text)
