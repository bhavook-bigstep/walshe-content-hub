"""Deterministic, offline stub connector (Contract 4).

Used whenever no Instagram token is configured — keeps dev/demo/tests publishing without network
egress. The synthetic external id is derived from the inputs so runs are reproducible.
"""

from __future__ import annotations

import hashlib

from app.social.base import PublishConnector, PublishResult


class StubConnector(PublishConnector):
    name = "stub"

    def publish(
        self,
        *,
        image_url: str | None = None,
        video_url: str | None = None,
        caption: str,
        idempotency_key: str | None = None,
    ) -> PublishResult:
        digest = hashlib.sha256(f"{caption}|{image_url}|{video_url}".encode()).hexdigest()[:12]
        return PublishResult(external_id=f"stub-{digest}", permalink=None)
