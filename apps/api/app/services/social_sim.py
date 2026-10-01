"""Simulated social connector (AC14).

No real OAuth and no network egress (Contract 2): "publishing" is a pure, deterministic function
that validates the channel and returns a synthetic receipt.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

CHANNELS: frozenset[str] = frozenset({"facebook", "instagram", "linkedin", "x"})


class UnsupportedChannel(ValueError):
    pass


@dataclass(frozen=True)
class PublishReceipt:
    channel: str
    external_id: str
    published_at: datetime


def validate_channel(channel: str) -> str:
    if channel not in CHANNELS:
        raise UnsupportedChannel(channel)
    return channel


def publish(*, channel: str, composition_id: int, now: datetime) -> PublishReceipt:
    """Pretend to publish; the id is derived from inputs so runs are reproducible."""
    validate_channel(channel)
    return PublishReceipt(
        channel=channel,
        external_id=f"sim-{channel}-{composition_id}-{int(now.timestamp())}",
        published_at=now,
    )
