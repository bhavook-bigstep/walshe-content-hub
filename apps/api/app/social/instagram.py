"""Real Instagram connector — Graph API with Instagram Login (graph.instagram.com).

Implements the documented 3-step publish flow, verified by hand against a live account:
  1. POST /{ig-user-id}/media      -> container id      (image_url must be publicly fetchable)
  2. GET  /{container-id}?fields=status_code  (poll until FINISHED)
  3. POST /{ig-user-id}/media_publish  (creation_id)   -> published media id
then GET /{media-id}?fields=permalink for the receipt link.

Egress is confined here, only to graph.instagram.com, and only when a token is configured
(Contract 2 / security.md controlled-egress). The token is read from Settings (env) and never
logged. A ``transport`` is injectable so tests run against a mock with no network.
Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing/ (Graph API v26.0).
"""

from __future__ import annotations

import time

import httpx

from app.config import Settings
from app.social.base import PublishConnector, PublishError, PublishResult

# Meta error_subcode -> (our code, retryable). See the spec §5 error table.
_SUBCODE: dict[int, tuple[str, bool]] = {
    2207052: ("media_fetch_failed", False),  # media could not be fetched (bad/non-public URL)
    2207003: ("download_timeout", True),  # media download took too long
    2207020: ("container_expired", False),
    2207026: ("unsupported_format", False),  # unsupported video format
    2207005: ("unsupported_format", False),  # unsupported image format
    9007: ("not_ready", True),  # media not ready to publish
    2207027: ("not_ready", True),
}
# Top-level error.code -> (our code, retryable) for errors without a mapped subcode.
_CODE: dict[int, tuple[str, bool]] = {
    190: ("token_expired", False),
    4: ("rate_limited", True),
    9: ("rate_limited", True),
    17: ("rate_limited", True),
    32: ("rate_limited", True),
    613: ("rate_limited", True),
}


class InstagramConnector(PublishConnector):
    name = "instagram"

    def __init__(
        self,
        settings: Settings,
        *,
        transport: httpx.BaseTransport | None = None,
        max_polls: int = 5,
        poll_interval: float = 1.0,
        video_max_polls: int = 60,
        video_poll_interval: float = 5.0,
        sleep=time.sleep,
    ) -> None:
        self._s = settings
        self._base = f"https://graph.instagram.com/{settings.graph_api_version}"
        self._client = httpx.Client(transport=transport, timeout=60.0)
        self._max_polls = max_polls
        self._poll_interval = poll_interval
        self._video_max_polls = video_max_polls
        self._video_poll_interval = video_poll_interval
        self._sleep = sleep

    def _raise(self, resp: httpx.Response) -> None:
        try:
            err = (resp.json() or {}).get("error", {})
        except Exception:  # noqa: BLE001 - a non-JSON error body still must not leak / crash
            err = {}
        code = err.get("code")
        sub = err.get("error_subcode")
        msg = err.get("message", "") or f"HTTP {resp.status_code}"
        if sub in _SUBCODE:
            mapped, retry = _SUBCODE[sub]
        elif code in _CODE:
            mapped, retry = _CODE[code]
        else:
            mapped, retry = ("unknown", False)
        raise PublishError(mapped, msg, retryable=retry)

    def publish(
        self,
        *,
        image_url: str | None = None,
        video_url: str | None = None,
        caption: str,
        idempotency_key: str | None = None,
    ) -> PublishResult:
        if not image_url and not video_url:
            raise PublishError(
                "no_media_url",
                "Instagram requires a public image_url or video_url",
                retryable=False,
            )
        uid = self._s.ig_user_id
        tok = self._s.instagram_access_token

        # 1. create container — a Reel for video, a feed photo for image. Video needs a longer poll
        #    because Instagram transcodes it server-side before it can be published.
        if video_url:
            create_data = {
                "media_type": "REELS",
                "video_url": video_url,
                "caption": caption,
                "access_token": tok,
            }
            max_polls, interval = self._video_max_polls, self._video_poll_interval
        else:
            create_data = {"image_url": image_url, "caption": caption, "access_token": tok}
            max_polls, interval = self._max_polls, self._poll_interval
        created = self._client.post(f"{self._base}/{uid}/media", data=create_data)
        if created.status_code >= 400:
            self._raise(created)
        container_id = created.json()["id"]

        # 2. poll until FINISHED
        for attempt in range(max_polls):
            polled = self._client.get(
                f"{self._base}/{container_id}",
                params={"fields": "status_code", "access_token": tok},
            )
            status_code = (polled.json() or {}).get("status_code")
            if status_code == "FINISHED":
                break
            if status_code == "ERROR":
                raise PublishError("processing_error", "container ERROR", retryable=True)
            if attempt < max_polls - 1:
                self._sleep(interval)
        else:
            raise PublishError("not_ready", "container not FINISHED in time", retryable=True)

        # 3. publish
        published = self._client.post(
            f"{self._base}/{uid}/media_publish",
            data={"creation_id": container_id, "access_token": tok},
        )
        if published.status_code >= 400:
            self._raise(published)
        media_id = published.json()["id"]

        # permalink (best-effort; failure here does not fail the publish)
        permalink = None
        link = self._client.get(
            f"{self._base}/{media_id}", params={"fields": "permalink", "access_token": tok}
        )
        if link.status_code < 400:
            permalink = (link.json() or {}).get("permalink")
        return PublishResult(external_id=media_id, permalink=permalink)
