"""Deterministic text embedding (AC44 offline/default).

A hashing bag-of-words embedding: tokens are hashed into a fixed-dimension vector, then normalised.
No model, network or key, so retrieval is reproducible in tests and works offline for the demo
(Contract 4). Texts that share words get a higher cosine — enough to drive hybrid ranking here.
A real embedding model can override ``AIProvider.embed`` at runtime for true semantics.
"""

from __future__ import annotations

import hashlib
import math
import re

EMBED_DIM = 64


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


def deterministic_embedding(text: str, dim: int = EMBED_DIM) -> list[float]:
    """A stable unit vector for ``text`` (hashing BoW). Same input → same vector, always."""
    vec = [0.0] * dim
    for tok in _tokens(text):
        h = int.from_bytes(hashlib.sha256(tok.encode()).digest()[:8], "big")
        idx = h % dim
        sign = 1.0 if (h >> 8) & 1 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(v * v for v in vec))
    return [v / norm for v in vec] if norm > 0 else vec


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity of two equal-length vectors (0 when either is degenerate)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0
