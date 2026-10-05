"""Password hashing + signed bearer tokens.

Stdlib only (``hashlib`` PBKDF2 + ``hmac`` signatures) — no native build deps, fully deterministic
given a fixed salt in tests. PoC-grade auth, not production hardening (out of scope, spec §6).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

_PBKDF2_ROUNDS = 120_000


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """Return ``pbkdf2$<rounds>$<salt_b64>$<hash_b64>``."""
    salt = salt or os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2${_PBKDF2_ROUNDS}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, rounds_s, salt_b64, hash_b64 = stored.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2":
        return False
    salt = _unb64(salt_b64)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds_s))
    return hmac.compare_digest(_b64(dk), hash_b64)


def create_token(*, secret: str, sub: int, role: str, tenant_id: int | None, ttl: int) -> str:
    payload = {"sub": sub, "role": role, "tenant_id": tenant_id, "exp": int(time.time()) + ttl}
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = _sign(secret, body)
    return f"{body}.{sig}"


def decode_token(token: str, *, secret: str) -> dict | None:
    """Return the payload dict if the signature is valid and unexpired, else ``None``."""
    try:
        body, sig = token.split(".")
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(secret, body)):
        return None
    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


def _sign(secret: str, body: str) -> str:
    return _b64(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
