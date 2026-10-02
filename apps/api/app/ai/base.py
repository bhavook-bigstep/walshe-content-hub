"""The single AI interface every provider implements (AC16)."""

from __future__ import annotations

import abc
from dataclasses import dataclass


@dataclass(frozen=True)
class AIResponse:
    text: str
    provider: str
    model: str


class AIProvider(abc.ABC):
    """One interface, selected by config. Builder (AC10) talks only to this type."""

    name: str = "base"

    def __init__(self, model: str) -> None:
        self.model = model

    @abc.abstractmethod
    def complete(self, prompt: str, *, max_tokens: int = 512) -> AIResponse:
        """Return a completion for ``prompt``."""
        raise NotImplementedError
