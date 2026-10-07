"""Task 2 — platform metric registry: the per-platform 'matrix' for ingestion + dashboard."""

from __future__ import annotations

from app.social.metrics import metric_keys, metrics_for


def test_instagram_feed_metric_set():
    assert metric_keys("instagram", "IMAGE") == [
        "reach",
        "views",
        "likes",
        "comments",
        "saved",
        "shares",
        "total_interactions",
    ]


def test_instagram_reel_subset_is_within_feed_set():
    reel = metric_keys("instagram", "REELS")
    assert "views" in reel and "saved" in reel
    assert all(k in metric_keys("instagram", "IMAGE") for k in reel)


def test_unknown_platform_is_empty():
    assert metrics_for("tiktok", "IMAGE") == ()
    assert metric_keys("tiktok", "IMAGE") == []
