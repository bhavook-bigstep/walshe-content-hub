"""Preflight check before an agent sends (AC34 / FR-42).

A deterministic rules engine: it checks a composition + channel against the live catalog and returns
specific, plain-word fixes. It is the control-vs-speed resolver — the board sets the rules once, the
agent gets an instant, understandable yes/no. Pure of the wall clock (``now`` is passed in) so it is
reproducible (Contract 4). A later increment may add an optional LangGraph node to re-phrase these
messages; the structured issues below are already the substance.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.composition import Composition
from app.models.user import User
from app.services import social_sim, visibility


@dataclass(frozen=True)
class PreflightIssue:
    code: str
    message: str  # what's wrong, in plain words
    fix: str  # what to do about it, in plain words


@dataclass(frozen=True)
class PreflightResult:
    ok: bool
    issues: list[PreflightIssue]


def run_preflight(
    db: Session, agent: User, composition: Composition, channel: str, *, now: datetime
) -> PreflightResult:
    """Check a composition + channel and return every blocking issue with a plain-word fix."""
    issues: list[PreflightIssue] = []

    try:
        social_sim.validate_channel(channel)
    except social_sim.UnsupportedChannel:
        issues.append(
            PreflightIssue(
                code="unsupported_channel",
                message=f"“{channel}” isn’t a channel you can send to.",
                fix="Choose one of: facebook, instagram, linkedin, x.",
            )
        )

    # An empty composition is NOT a preflight failure (AC34, v2.34.0): a post with no catalog items
    # proceeds straight to the approval gate (AC80) — the human reviewer is the control for empty or
    # unverified posts, not this automated check. We only validate items that ARE present.
    item_ids = composition.item_ids or []
    if item_ids:
        # One visibility pass (approved + brand-safe + unexpired + off-limits + scope); the loaded
        # entries are reused for the staleness check so there is no extra query (AC33/AC34).
        visible = visibility.agent_visible_entries_by_ids(db, agent, item_ids, now=now)
        visible_ids = {e.id for e in visible}
        unavailable = [i for i in item_ids if i not in visible_ids]
        if unavailable:
            n = len(unavailable)
            issues.append(
                PreflightIssue(
                    code="unavailable_items",
                    message=(
                        f"{n} item{'s' if n > 1 else ''} in this post "
                        f"{'are' if n > 1 else 'is'} no longer available "
                        "(expired, withdrawn, off-limits, or outside your permissions)."
                    ),
                    fix="Remove them, or replace them with current approved content.",
                )
            )
        # Stale = an available item whose master content moved since it was saved. Only flagged for
        # items that are still available, so an unavailable item is never double-reported.
        snapshot = composition.item_versions or {}
        stale = [
            e.id for e in visible if e.content_version != snapshot.get(str(e.id), e.content_version)
        ]
        if stale:
            n = len(stale)
            issues.append(
                PreflightIssue(
                    code="stale_items",
                    message=f"{n} item{'s' if n > 1 else ''} changed since you added "
                    f"{'them' if n > 1 else 'it'}.",
                    fix="Refresh the item to use the latest approved version.",
                )
            )

    return PreflightResult(ok=not issues, issues=issues)
