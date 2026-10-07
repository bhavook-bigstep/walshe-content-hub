"""Fetch a published post's engagement metrics from Instagram — real adapter + deterministic stub.

Real: the media-insights edge (reach/views/saved/shares/total_interactions) plus the basic
``like_count``/``comments_count`` fields (no insights permission needed). The metric set
comes from the platform registry, so this stays in lockstep with the dashboard. Needs the
``instagram_business_manage_insights`` for the insights edge; errors are typed, not fatal.
Stub: registry-shaped, deterministic from the media id (Contract 4 — offline + reproducible).
Docs: https://developers.facebook.com/documentation/instagram-platform/insights (Graph API v26.0).
"""

from __future__ import annotations

import abc
import hashlib

import httpx

from app.config import Settings
from app.social.base import PublishError
from app.social.metrics import metric_keys
from app.social.token import account_token

# Metrics served by the basic media fields rather than the insights edge.
_BASIC = {"likes": "like_count", "comments": "comments_count"}


class InsightsConnector(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def fetch_insights(self, *, external_id: str, media_type: str) -> dict[str, int]:
        """Return {metric_key: value} for the post, shaped by the platform registry."""


class StubInsights(InsightsConnector):
    name = "stub"

    def fetch_insights(self, *, external_id: str, media_type: str) -> dict[str, int]:
        out: dict[str, int] = {}
        for key in metric_keys("instagram", media_type):
            digest = hashlib.sha256(f"{external_id}:{key}".encode()).hexdigest()
            out[key] = int(digest, 16) % 1000
        return out


class InstagramInsights(InsightsConnector):
    name = "instagram"

    def __init__(self, settings: Settings, *, transport: httpx.BaseTransport | None = None) -> None:
        self._s = settings
        self._base = f"https://graph.instagram.com/{settings.graph_api_version}"
        self._client = httpx.Client(transport=transport, timeout=30.0)

    def _raise(self, resp: httpx.Response) -> None:
        try:
            err = (resp.json() or {}).get("error", {})
        except Exception:  # noqa: BLE001
            err = {}
        code = err.get("code")
        msg = err.get("message", "") or f"HTTP {resp.status_code}"
        if code == 10 or "permission" in msg.lower():
            raise PublishError("insights_permission", msg, retryable=False)
        if code == 190:
            raise PublishError("token_expired", msg, retryable=False)
        if code in (4, 17, 32, 613):
            raise PublishError("rate_limited", msg, retryable=True)
        raise PublishError("unknown", msg, retryable=False)

    def fetch_insights(self, *, external_id: str, media_type: str) -> dict[str, int]:
        tok = account_token(self._s)
        keys = metric_keys("instagram", media_type)
        out: dict[str, int] = {k: 0 for k in keys}

        # insights edge for the metrics it serves (everything except the basic like/comment counts)
        insight_metrics = [k for k in keys if k not in _BASIC]
        if insight_metrics:
            r = self._client.get(
                f"{self._base}/{external_id}/insights",
                params={"metric": ",".join(insight_metrics), "access_token": tok},
            )
            if r.status_code >= 400:
                self._raise(r)
            for row in (r.json() or {}).get("data", []):
                name = row.get("name")
                if name not in out:
                    continue
                values = row.get("values") or [{}]
                total = row.get("total_value") or {}
                out[name] = int(total.get("value", values[0].get("value", 0)) or 0)

        # basic fields for likes/comments (available without the insights permission)
        basic_wanted = [k for k in keys if k in _BASIC]
        if basic_wanted:
            r = self._client.get(
                f"{self._base}/{external_id}",
                params={"fields": ",".join(_BASIC[k] for k in basic_wanted), "access_token": tok},
            )
            if r.status_code >= 400:
                self._raise(r)
            body = r.json() or {}
            for k in basic_wanted:
                out[k] = int(body.get(_BASIC[k], 0) or 0)
        return out
