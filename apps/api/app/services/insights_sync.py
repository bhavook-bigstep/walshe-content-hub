"""Pure insights-sync core — pull metrics for published posts and record the outcome.

Driven by the background lifespan worker (every 10 min) and by the on-demand refresh endpoint. On
success it appends an `Engagement` snapshot; on a typed failure it records the error in
`PostInsightsSync` and leaves the last-good snapshot intact. The clock is injected (Contract 4) and
per-post errors never abort the run.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.engagement import Engagement
from app.models.post import Post
from app.models.post_insights_sync import PostInsightsSync
from app.social.base import PublishError
from app.social.insights import InsightsConnector

# Posts published through the app are feed images; extend when a Reel route lands.
_DEFAULT_MEDIA_TYPE = "IMAGE"


def _upsert_sync(
    db: Session, post_id: int, now: datetime, status: str, error: str = ""
) -> None:
    row = db.get(PostInsightsSync, post_id)
    if row is None:
        db.add(
            PostInsightsSync(
                post_id=post_id, last_synced_at=now, sync_status=status, last_error=error
            )
        )
    else:
        row.last_synced_at = now
        row.sync_status = status
        row.last_error = error


def sync_insights(
    db: Session,
    connector: InsightsConnector,
    now: datetime,
    *,
    max_age_days: int = 30,
    post_ids: list[int] | None = None,
) -> int:
    """Sync eligible published posts; return the count of successful snapshots."""
    stmt = select(Post).where(Post.external_id.is_not(None))
    if post_ids is not None:
        stmt = stmt.where(Post.id.in_(post_ids))
    else:
        stmt = stmt.where(Post.published_at >= now - timedelta(days=max_age_days))

    ok = 0
    for post in db.execute(stmt).scalars().all():
        try:
            metrics = connector.fetch_insights(
                external_id=post.external_id, media_type=_DEFAULT_MEDIA_TYPE
            )
        except PublishError as err:
            _upsert_sync(db, post.id, now, "error", f"{err.code}: {err}")
            continue
        db.add(
            Engagement(
                post_id=post.id,
                platform=post.platform or "instagram",
                metrics=metrics,
                fetched_at=now,
            )
        )
        _upsert_sync(db, post.id, now, "ok", "")
        ok += 1
    db.commit()
    return ok
