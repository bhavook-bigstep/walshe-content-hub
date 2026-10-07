"""Task 4 — platform-tagged Engagement snapshots + PostInsightsSync state."""

from __future__ import annotations

from datetime import datetime, timezone


def test_engagement_stores_platform_metrics_snapshot(app):
    from app.models.engagement import Engagement

    with app.state.sessionmaker() as db:
        db.add(
            Engagement(
                post_id=1,
                platform="instagram",
                metrics={"reach": 10, "likes": 3},
                fetched_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
        row = db.query(Engagement).one()
        assert row.platform == "instagram"
        assert row.metrics["reach"] == 10


def test_post_insights_sync_row(app):
    from app.models.post_insights_sync import PostInsightsSync

    with app.state.sessionmaker() as db:
        db.add(
            PostInsightsSync(
                post_id=1,
                last_synced_at=datetime.now(timezone.utc),
                sync_status="error",
                last_error="insights_permission: nope",
            )
        )
        db.commit()
        assert db.query(PostInsightsSync).one().sync_status == "error"
