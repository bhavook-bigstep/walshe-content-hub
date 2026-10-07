"""Pure helpers for AI caption + keyword generation (Generate caption / Generate keywords).

Talks only to the AC16 ``AIProvider`` abstraction. Everything here is a pure function of the
selected catalog items, so with the deterministic stub provider (no key) the output is reproducible
and the demo/tests never touch the network (Contract 4). Mirrors ``app.ai.builder``: a real provider
is asked for suggestions, and the stub falls back to a deterministic, content-grounded result.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ai.base import AIProvider

# Instagram caption hard limit; captions longer than this are rejected by the API.
INSTAGRAM_CAPTION_MAX = 2200
# A tight, relevant set reads better than a wall of tags (Instagram ranks only the first ~30).
_MAX_HASHTAGS = 12
_MIN_TOKEN = 3
# Evergreen travel tags so the set is never empty and reads like a real post.
_EVERGREEN = ("Travel", "Explore", "Wanderlust")
# Low-signal words dropped before a word becomes a single-word hashtag.
_STOPWORDS = frozenset(
    {
        "the", "and", "for", "with", "from", "this", "that", "your", "our", "are",
        "was", "into", "onto", "over", "its", "has", "you", "out", "off", "all",
        "a", "an", "of", "to", "in", "on", "at", "by", "or", "as", "is", "it", "be",
    }
)


@dataclass(frozen=True)
class CopyItem:
    """A selected catalog item the copy may draw on (title + destination + description only)."""

    title: str
    destination: str = ""
    description: str = ""


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"[^A-Za-z0-9]+", text) if w]


def _titlecase(word: str) -> str:
    return word[:1].upper() + word[1:]


def _camel(phrase: str) -> str:
    """"County Clare" -> "CountyClare" (a single, clean multiword hashtag label)."""
    return "".join(_titlecase(w) for w in _words(phrase))


def build_prompt(items: list[CopyItem]) -> str:
    """One clean, grounded prompt from the selected catalog items (titles + destinations + text)."""
    if not items:
        return "Write a short, upbeat Instagram caption for a travel destination."
    lines = [
        "Write a short, engaging Instagram caption for a travel marketing post.",
        "Ground it only in these catalog items:",
    ]
    for item in items:
        where = f" ({item.destination})" if item.destination else ""
        desc = f" — {item.description}" if item.description else ""
        lines.append(f"- {item.title}{where}{desc}")
    return "\n".join(lines)


def caption_prompt(items: list[CopyItem]) -> str:
    """Caption prompt with strict output rules so the model returns ONE paste-ready caption.

    Without these rules a chat model tends to answer with a preamble ("Here are a few options…")
    and a numbered list instead of a single usable caption.
    """
    return (
        build_prompt(items)
        + "\n\nReturn ONLY the caption text — a single, paste-ready caption. No preamble, no "
        "numbered or bulleted options, no surrounding quotes, no hashtags, no explanation. "
        "Keep it under 300 characters."
    )


def keyword_prompt(items: list[CopyItem]) -> str:
    """Prompt variant asking a real provider for hashtags (the stub path never uses this)."""
    return (
        build_prompt(items)
        + "\nReply with 8-12 relevant Instagram hashtags, space-separated, each starting with #."
    )


def clamp_caption(text: str) -> str:
    """Trim whitespace and cap at Instagram's caption limit."""
    return text.strip()[:INSTAGRAM_CAPTION_MAX]


def parse_hashtags(text: str) -> list[str]:
    """Pull hashtag-like tokens out of a provider completion, normalising each to ``#CamelWord``."""
    out: list[str] = []
    for token in re.findall(r"#?[A-Za-z0-9][A-Za-z0-9 ]*", text):
        label = _camel(token)
        if len(label) >= _MIN_TOKEN:
            out.append("#" + label)
    return out


def content_hashtags(items: list[CopyItem]) -> list[str]:
    """Deterministic ``#``-prefixed hashtags derived from the items' content + destination."""
    seen: set[str] = set()
    tags: list[str] = []

    def add(label: str) -> None:
        if len(label) < _MIN_TOKEN:
            return
        key = label.lower()
        if key in seen:
            return
        seen.add(key)
        tags.append("#" + label)

    # Whole destination + title as compact multiword tags first (the strongest signal).
    for item in items:
        add(_camel(item.destination))
        add(_camel(item.title))
    # Then significant single words across title/destination/description.
    for item in items:
        if len(tags) >= _MAX_HASHTAGS:
            break
        for word in _words(f"{item.title} {item.destination} {item.description}"):
            if word.lower() not in _STOPWORDS:
                add(_titlecase(word))
            if len(tags) >= _MAX_HASHTAGS:
                break
    # Top up with evergreen tags so the set is never empty.
    for ever in _EVERGREEN:
        if len(tags) >= _MAX_HASHTAGS:
            break
        add(ever)
    return tags[:_MAX_HASHTAGS]


def generate_caption(items: list[CopyItem], provider: AIProvider) -> str:
    """Generate a caption via the provider; the stub yields a deterministic, prompt-derived line."""
    return clamp_caption(provider.complete(caption_prompt(items)).text)


def generate_hashtags(items: list[CopyItem], provider: AIProvider) -> list[str]:
    """Suggest Instagram hashtags grounded in the items' content.

    The content-derived set is always the base (deterministic under the stub); a real provider's
    suggestions are merged ahead of it. Never returns an empty list.
    """
    tags = content_hashtags(items)
    if provider.name != "stub":
        suggested = parse_hashtags(provider.complete(keyword_prompt(items), max_tokens=256).text)
        merged: list[str] = []
        seen: set[str] = set()
        for tag in [*suggested, *tags]:
            key = tag.lower()
            if key not in seen:
                seen.add(key)
                merged.append(tag)
        tags = merged[:_MAX_HASHTAGS]
    return tags or ["#" + _EVERGREEN[0]]
