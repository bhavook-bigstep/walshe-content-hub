"""Tasks 2-4 — publish connector: deterministic stub, real Instagram adapter, env-gated factory.

Hermetic: the real adapter is exercised with a mock httpx transport; no network egress."""

from __future__ import annotations

import httpx
import pytest

from app.config import Settings
from app.social.base import PublishError
from app.social.factory import get_connector
from app.social.instagram import InstagramConnector
from app.social.stub import StubConnector


# ---- Task 2: stub -----------------------------------------------------------
def test_stub_is_deterministic_and_needs_no_url():
    c = StubConnector()
    a = c.publish(image_url=None, caption="hello")
    b = c.publish(image_url=None, caption="hello")
    assert c.name == "stub"
    assert a.external_id == b.external_id
    assert a.external_id.startswith("stub-")
    assert a.permalink is None


def test_stub_varies_with_inputs():
    c = StubConnector()
    assert c.publish(image_url=None, caption="a").external_id != c.publish(
        image_url=None, caption="b"
    ).external_id


# ---- Task 3: real Instagram connector (mock transport) ----------------------
def _settings() -> Settings:
    return Settings(_env_file=None, instagram_access_token="tok", ig_user_id="123")


class _Transport(httpx.BaseTransport):
    """Returns queued (status, json) responses in order; records the requests it saw."""

    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        status, payload = self._responses.pop(0)
        return httpx.Response(status, json=payload, request=request)


def test_publish_happy_path():
    t = _Transport(
        [
            (200, {"id": "CONTAINER1"}),  # create container
            (200, {"status_code": "FINISHED"}),  # poll
            (200, {"id": "MEDIA1"}),  # publish
            (200, {"permalink": "https://instagram.com/p/x"}),  # permalink
        ]
    )
    c = InstagramConnector(_settings(), transport=t)
    r = c.publish(image_url="https://s3/x.jpg", caption="hi")
    assert r.external_id == "MEDIA1"
    assert r.permalink == "https://instagram.com/p/x"


def test_publish_media_fetch_failed_is_nonretryable():
    t = _Transport(
        [
            (
                400,
                {
                    "error": {
                        "code": 9004,
                        "error_subcode": 2207052,
                        "message": "media could not be fetched",
                    }
                },
            )
        ]
    )
    c = InstagramConnector(_settings(), transport=t)
    with pytest.raises(PublishError) as ei:
        c.publish(image_url="https://bad", caption="hi")
    assert ei.value.code == "media_fetch_failed"
    assert ei.value.retryable is False


def test_publish_token_expired_maps_190():
    t = _Transport([(400, {"error": {"code": 190, "message": "expired"}})])
    with pytest.raises(PublishError) as ei:
        InstagramConnector(_settings(), transport=t).publish(image_url="https://x", caption="hi")
    assert ei.value.code == "token_expired"


def test_publish_requires_image_url():
    with pytest.raises(PublishError) as ei:
        InstagramConnector(_settings()).publish(image_url=None, caption="hi")
    assert ei.value.code == "no_media_url"


def test_publish_video_uses_reels_flow():
    t = _Transport(
        [
            (200, {"id": "VC1"}),  # create REELS container
            (200, {"status_code": "FINISHED"}),  # poll
            (200, {"id": "MEDIA_V"}),  # publish
            (200, {"permalink": "https://instagram.com/reel/x"}),
        ]
    )
    c = InstagramConnector(_settings(), transport=t)
    r = c.publish(video_url="https://s3/x.mp4", caption="v")
    assert r.external_id == "MEDIA_V"
    assert r.permalink == "https://instagram.com/reel/x"
    body = t.calls[0].content.decode()  # the create-container request body
    assert "media_type=REELS" in body
    assert "video_url=" in body


def test_publish_requires_image_or_video():
    with pytest.raises(PublishError) as ei:
        InstagramConnector(_settings()).publish(caption="x")
    assert ei.value.code == "no_media_url"


# ---- Task 4: factory --------------------------------------------------------
def test_factory_stub_without_keys():
    assert get_connector(Settings(_env_file=None)).name == "stub"


def test_factory_real_with_keys():
    assert get_connector(_settings()).name == "instagram"
