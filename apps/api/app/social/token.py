"""Resolve the Instagram access token for a connector call.

Env-backed today (one shared account); this is the seam where a future "Connect Instagram" (OAuth)
increment returns a per-user, encrypted-at-rest token for the given user instead. Keeping all token
lookups behind this function means that change touches one place, not every call site.
"""

from __future__ import annotations

from app.config import Settings


def account_token(settings: Settings, user=None) -> str | None:
    """Return the access token to use. Today: the env token. Later: the user's connected account."""
    return settings.instagram_access_token
