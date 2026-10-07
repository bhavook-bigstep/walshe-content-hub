"""Platform metric registry — the per-platform engagement "matrix".

Single source of truth for *what metrics exist* on each platform: it drives both what the insights
connector requests from the API and what the dashboard renders. Instagram is defined now; adding
Facebook / X / YouTube / a blog later is one new ``PlatformMetrics`` entry (plus its connector) with
no schema change. Instagram metric names are Meta-defined (``views`` replaced ``impressions``,
removed Apr 2025); cite the docs in the PR per `.claude/rules/citations.md`.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class MetricDef:
    key: str  # the platform's metric name (e.g. Instagram "reach")
    label: str  # dashboard label
    order: int  # display order


@dataclass(frozen=True)
class PlatformMetrics:
    platform: str
    metrics: tuple[MetricDef, ...]  # the feed/default set
    reel_exclude: frozenset[str] = field(default_factory=frozenset)  # keys invalid for reels


_INSTAGRAM = PlatformMetrics(
    platform="instagram",
    metrics=(
        MetricDef("reach", "Reach", 1),
        MetricDef("views", "Views", 2),
        MetricDef("likes", "Likes", 3),
        MetricDef("comments", "Comments", 4),
        MetricDef("saved", "Saved", 5),
        MetricDef("shares", "Shares", 6),
        MetricDef("total_interactions", "Interactions", 7),
    ),
)

REGISTRY: dict[str, PlatformMetrics] = {"instagram": _INSTAGRAM}


def metrics_for(platform: str, media_type: str) -> tuple[MetricDef, ...]:
    """The applicable metric defs for a platform + media type (reels drop any excluded keys)."""
    pm = REGISTRY.get(platform)
    if pm is None:
        return ()
    if media_type.upper() == "REELS":
        return tuple(m for m in pm.metrics if m.key not in pm.reel_exclude)
    return pm.metrics


def metric_keys(platform: str, media_type: str) -> list[str]:
    return [m.key for m in metrics_for(platform, media_type)]
