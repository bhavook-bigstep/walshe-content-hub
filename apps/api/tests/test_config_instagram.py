"""Task 1 — Instagram/S3 config fields + readiness helpers. Hermetic (no .env, no env)."""

from __future__ import annotations

from app.config import Settings


def test_instagram_defaults_are_unset_and_stub_by_default():
    s = Settings(_env_file=None)
    assert s.graph_api_version == "v26.0"
    assert s.instagram_configured() is False  # no token / user id
    assert s.s3_configured() is False
    assert s.s3_presign_ttl == 3600


def test_instagram_configured_when_token_and_user_present():
    s = Settings(_env_file=None, instagram_access_token="t", ig_user_id="123")
    assert s.instagram_configured() is True


def test_s3_configured_requires_all_four_values():
    partial = Settings(_env_file=None, s3_bucket="b", s3_region="r")
    assert partial.s3_configured() is False
    full = Settings(
        _env_file=None,
        s3_bucket="b",
        s3_region="r",
        aws_access_key_id="k",
        aws_secret_access_key="x",
    )
    assert full.s3_configured() is True


def test_insights_sync_defaults():
    s = Settings(_env_file=None)
    assert s.insights_sync_enabled is False
    assert s.insights_sync_interval_seconds == 600
    assert s.insights_max_age_days == 30


def test_account_token_returns_env_token():
    from app.social.token import account_token

    s = Settings(_env_file=None, instagram_access_token="tok", ig_user_id="1")
    assert account_token(s) == "tok"
    assert account_token(Settings(_env_file=None)) is None
