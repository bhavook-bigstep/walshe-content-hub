"""Canonical injectable clock (Contract 4 — reproducibility).

``now()`` is the **single** place request logic reads the wall clock. Routers depend on it via
``now: datetime = Depends(clock.now)``; tests override it deterministically with
``app.dependency_overrides[clock.now] = lambda: FIXED``. No logic may call ``datetime.now()`` /
``utcnow()`` directly.
"""

from __future__ import annotations

from datetime import datetime, timezone


def now() -> datetime:
    """UTC wall-clock now. Override in tests via ``app.dependency_overrides[clock.now]``."""
    return datetime.now(timezone.utc)
