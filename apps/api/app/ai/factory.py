"""Provider selection (AC16): pick by ``AI_PROVIDER``, fall back to the stub when no key is set.

Logs the provider *name* only — never a key (Contract 2).
"""
from __future__ import annotations

import logging

from app.ai.base import AIProvider
from app.ai.claude import ClaudeProvider
from app.ai.gemini import GeminiProvider
from app.ai.openai import OpenAIProvider
from app.ai.stub import StubProvider
from app.config import Settings

logger = logging.getLogger("app.ai")

_KEY_ATTR = {
    "claude": "anthropic_api_key",
    "openai": "openai_api_key",
    "gemini": "gemini_api_key",
}
_PROVIDER_CLS = {
    "claude": ClaudeProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
}


def get_provider(settings: Settings) -> AIProvider:
    """Return the configured provider, or a deterministic stub when its key is absent."""
    choice = (settings.ai_provider or "").lower()
    key_attr = _KEY_ATTR.get(choice)
    api_key = getattr(settings, key_attr) if key_attr else None

    if key_attr is None:
        logger.info("Unknown AI_PROVIDER %r; using deterministic stub", choice)
        return StubProvider()
    if not api_key:
        logger.info("No key for provider %s; falling back to deterministic stub", choice)
        return StubProvider()

    logger.info("Using AI provider %s (model %s)", choice, settings.ai_model)
    return _PROVIDER_CLS[choice](api_key=api_key, model=settings.ai_model)
