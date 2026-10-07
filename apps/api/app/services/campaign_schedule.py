"""Pure scheduling rules for campaign posts (design §4.1). No I/O, no clock reads."""

from __future__ import annotations

from datetime import date, datetime


def within_campaign_window(scheduled_at: datetime, starts_on: date, ends_on: date) -> bool:
    """True iff the post's LOCAL calendar date (in the datetime's own offset) is in [start, end].

    The caller passes an offset-aware datetime; ``.date()`` yields the date in that submitted
    offset — never the server timezone — which is what the campaign window is checked against.
    """
    local_date = scheduled_at.date()
    return starts_on <= local_date <= ends_on
