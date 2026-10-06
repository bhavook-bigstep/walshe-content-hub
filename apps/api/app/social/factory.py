"""Pick the publish connector from config (parallels app.ai.factory.get_provider).

Real Instagram adapter when a token + user id are set; otherwise the deterministic stub. Logs the
chosen connector *name* only — never the token (Contract 2).
"""

from __future__ import annotations

import logging

from app.config import Settings
from app.social.base import PublishConnector
from app.social.instagram import InstagramConnector
from app.social.stub import StubConnector

log = logging.getLogger(__name__)


def get_connector(settings: Settings) -> PublishConnector:
    if settings.instagram_configured():
        log.info("publish connector: instagram")
        return InstagramConnector(settings)
    log.info("publish connector: stub (no Instagram keys configured)")
    return StubConnector()
