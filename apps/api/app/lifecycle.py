"""Pure lifecycle derivation (AC32/AC33).

No DB, no clock import — ``now`` is always passed in so the helpers are deterministic and unit
testable. ``display_status`` turns a stored status + validity window into the status actually shown
(adding the derived ``expiring_soon`` / ``expired``); ``is_expired`` is the single predicate the
visibility choke-point calls so the boundary rule lives in exactly one place.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.catalog import DisplayStatus, EntryStatus

# Default window in which an approved-but-soon-to-expire item is surfaced as "expiring soon".
# No source found — this is an AI-generated idea. A single constant keeps the helper pure; it can
# later move to config without touching call sites.
EXPIRING_SOON_WINDOW = timedelta(days=14)


def _aware(value: datetime) -> datetime:
    """Treat a naive datetime as UTC. SQLite (and some drivers) return tz-naive values even for a
    ``DateTime(timezone=True)`` column; this keeps comparisons with the aware clock safe and the
    boundary rule identical on Postgres and SQLite."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def display_status(
    stored: EntryStatus,
    expires_at: datetime | None,
    now: datetime,
    *,
    soon_window: timedelta = EXPIRING_SOON_WINDOW,
) -> DisplayStatus:
    """Derive the display status from the stored status, the validity window and the clock.

    Boundary semantics: ``now == expires_at`` ⇒ expired (half-open window
    ``[valid_from, expires_at)``). Only *approved* items ever derive ``expiring_soon`` /
    ``expired``; other stored statuses pass through unchanged.
    """
    if stored == EntryStatus.withdrawn:
        return DisplayStatus.withdrawn
    if stored != EntryStatus.approved:
        return DisplayStatus(stored.value)  # draft / in_review pass through
    if expires_at is not None:
        expiry = _aware(expires_at)
        if _aware(now) >= expiry:
            return DisplayStatus.expired
        if _aware(now) >= expiry - soon_window:
            return DisplayStatus.expiring_soon
    return DisplayStatus.approved


def is_expired(expires_at: datetime | None, now: datetime) -> bool:
    """True iff ``expires_at`` is set and the clock is at or past it (half-open window)."""
    return expires_at is not None and _aware(now) >= _aware(expires_at)
