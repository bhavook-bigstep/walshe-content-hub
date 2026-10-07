"""Publish connector interface (parallels app.ai.base).

One ``PublishConnector`` method, ``publish``, returns a ``PublishResult`` or raises a typed
``PublishError``. Two implementations: a real Instagram adapter and a deterministic stub, selected
by ``app.social.factory.get_connector`` from env (Contract 2: a real token flips it to live mode).
"""

from __future__ import annotations

import abc
from dataclasses import dataclass


@dataclass(frozen=True)
class PublishResult:
    """The outcome of a successful publish: the platform's media id and a permalink if known."""

    external_id: str
    permalink: str | None = None


class PublishError(Exception):
    """A publish failure classified for the caller.

    ``code`` is a stable, platform-agnostic slug (e.g. ``media_fetch_failed``, ``token_expired``,
    ``rate_limited``); ``retryable`` says whether a later retry could succeed without human/config
    action. The message never contains the access token (Contract 2).
    """

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class PublishConnector(abc.ABC):
    name: str = "base"

    @abc.abstractmethod
    def publish(
        self,
        *,
        image_url: str | None = None,
        video_url: str | None = None,
        caption: str,
        idempotency_key: str | None = None,
    ) -> PublishResult:
        """Publish one image or video (Reel) + caption; return a PublishResult or raise."""
