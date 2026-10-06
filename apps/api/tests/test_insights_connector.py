"""Task 3 — insights connector: deterministic stub + real Instagram adapter (mocked httpx)."""

from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.social.base import PublishError
from app.social.factory import get_insights_connector
from app.social.insights import InstagramInsights, StubInsights

_IG_KEYS = {"reach", "views", "likes", "comments", "saved", "shares", "total_interactions"}


def test_stub_is_deterministic_and_registry_shaped():
    c = StubInsights()
    a = c.fetch_insights(external_id="M1", media_type="IMAGE")
    b = c.fetch_insights(external_id="M1", media_type="IMAGE")
    assert c.name == "stub"
    assert a == b
    assert set(a.keys()) == _IG_KEYS
    assert all(isinstance(v, int) and v >= 0 for v in a.values())


def test_stub_varies_by_media():
    c = StubInsights()
    assert c.fetch_insights(external_id="M1", media_type="IMAGE") != c.fetch_insights(
        external_id="M2", media_type="IMAGE"
    )


class _Transport(httpx.BaseTransport):
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        status, payload = self._responses.pop(0)
        return httpx.Response(status, json=payload, request=request)


def _settings() -> Settings:
    return Settings(_env_file=None, instagram_access_token="t", ig_user_id="1")


def test_instagram_maps_insight_rows_and_basic_counts():
    t = _Transport(
        [
            (
                200,
                {
                    "data": [
                        {"name": "reach", "values": [{"value": 100}]},
                        {"name": "likes", "values": [{"value": 9}]},
                    ]
                },
            ),
            (200, {"like_count": 9, "comments_count": 2}),  # basic fields fill likes/comments
        ]
    )
    out = InstagramInsights(_settings(), transport=t).fetch_insights(
        external_id="M1", media_type="IMAGE"
    )
    assert out["reach"] == 100
    assert out["likes"] == 9
    assert out["comments"] == 2


def test_instagram_permission_error_is_typed():
    t = _Transport([(400, {"error": {"code": 10, "message": "insights perm missing"}})])
    with pytest.raises(PublishError) as ei:
        InstagramInsights(_settings(), transport=t).fetch_insights(external_id="M1", media_type="IMAGE")
    assert ei.value.code in ("insights_permission", "unknown")


def test_factory_picks_stub_without_keys():
    assert get_insights_connector(Settings(_env_file=None)).name == "stub"


def test_factory_picks_instagram_with_keys():
    assert get_insights_connector(_settings()).name == "instagram"
