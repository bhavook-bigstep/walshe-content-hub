"""Task 5 — pure insights sync: snapshot on success, record error + keep last-good on failure."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.engagement import Engagement
from app.models.post import Post, PostStatus
from app.models.post_insights_sync import PostInsightsSync
from app.services.insights_sync import sync_insights
from app.social.base import PublishError
from app.social.insights import StubInsights

NOW = datetime(2026, 1, 10, tzinfo=timezone.utc)


def _seed_posts(app):
    with app.state.sessionmaker() as db:
        db.add_all(
            [
                Post(composition_id=1, channel="instagram", platform="instagram",
                     status=PostStatus.published, external_id="MA",
                     published_at=NOW - timedelta(days=2)),
                Post(composition_id=1, channel="instagram", platform="instagram",
                     status=PostStatus.published, external_id="MB",
                     published_at=NOW - timedelta(days=40)),
                Post(composition_id=1, channel="instagram", platform="instagram",
                     status=PostStatus.scheduled, external_id=None, published_at=None),
            ]
        )
        db.commit()


def test_snapshots_only_recent_published_with_external_id(app):
    _seed_posts(app)
    with app.state.sessionmaker() as db:
        n = sync_insights(db, StubInsights(), NOW, max_age_days=30)
        assert n == 1  # only MA (recent + external_id); MB too old, draft has no external_id
        snaps = db.query(Engagement).all()
        assert len(snaps) == 1 and snaps[0].metrics["reach"] >= 0
        oks = db.query(PostInsightsSync).filter_by(sync_status="ok").all()
        assert len(oks) == 1


def test_manual_post_ids_overrides_age_window(app):
    _seed_posts(app)
    with app.state.sessionmaker() as db:
        mb = db.query(Post).filter_by(external_id="MB").one()
        n = sync_insights(db, StubInsights(), NOW, max_age_days=30, post_ids=[mb.id])
        assert n == 1  # MB synced despite being 40 days old, because explicitly requested


def test_per_post_error_recorded_not_fatal(app):
    _seed_posts(app)

    class _Boom(StubInsights):
        def fetch_insights(self, *, external_id, media_type):
            raise PublishError("insights_permission", "nope")

    with app.state.sessionmaker() as db:
        n = sync_insights(db, _Boom(), NOW, max_age_days=30)
        assert n == 0
        assert db.query(Engagement).count() == 0  # no snapshot written on failure
        err = db.query(PostInsightsSync).filter_by(sync_status="error").all()
        assert len(err) == 1 and "insights_permission" in err[0].last_error


def test_non_publish_error_is_also_non_fatal(app):
    # A raw transport error (not a PublishError) on one post must not abort the sweep or roll back
    # another post's good snapshot — the spec's "one bad post, keep going" guarantee.
    import httpx

    with app.state.sessionmaker() as db:
        db.add_all(
            [
                Post(composition_id=1, channel="instagram", platform="instagram",
                     status=PostStatus.published, external_id="E1",
                     published_at=NOW - timedelta(days=1)),
                Post(composition_id=1, channel="instagram", platform="instagram",
                     status=PostStatus.published, external_id="E2",
                     published_at=NOW - timedelta(days=1)),
            ]
        )
        db.commit()

    class _FlakyFirst(StubInsights):
        def fetch_insights(self, *, external_id, media_type):
            if external_id == "E1":
                raise httpx.ReadTimeout("network boom")
            return super().fetch_insights(external_id=external_id, media_type=media_type)

    with app.state.sessionmaker() as db:
        n = sync_insights(db, _FlakyFirst(), NOW, max_age_days=30)
        assert n == 1  # E2 still synced despite E1's transport error
        assert db.query(Engagement).count() == 1  # E2's good snapshot survived
        assert {r.sync_status for r in db.query(PostInsightsSync).all()} == {"ok", "error"}
