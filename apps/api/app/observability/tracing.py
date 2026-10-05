"""Agent-run tracing (AC45).

Two layers:
- **In-app trace** (`record_run`): one content-free ``AgentRun`` row per agentic run — always on,
  deterministic and demo-safe (no prompts/replies/keys/PII, ever).
- **LangSmith** (`configure_langsmith` + `trace_span`): optional external tracing of the LangGraph
  loop + creative plan + provider calls. OFF unless a ``LANGSMITH_API_KEY`` is set, so with no key
  there is no egress and the hermetic tests are unaffected (Contracts 2 + 4).
"""

from __future__ import annotations

import contextlib
import logging
import os
import time
from collections.abc import Iterator, Sequence

from sqlalchemy.orm import Session

from app.config import Settings
from app.models.agent_run import AgentRun

logger = logging.getLogger("app.observability")


def configure_langsmith(settings: Settings) -> bool:
    """Enable LangChain/LangGraph → LangSmith tracing when a key is set (called once at startup).

    With no key this is a no-op and returns False — nothing leaves the boundary. The key is read
    from the environment/Settings and set into LangChain's own env vars; it is never logged.
    """
    if not settings.langsmith_enabled():
        return False
    os.environ.setdefault("LANGCHAIN_TRACING_V2", "true")
    os.environ.setdefault("LANGCHAIN_API_KEY", settings.langsmith_api_key or "")
    os.environ.setdefault("LANGCHAIN_PROJECT", settings.langsmith_project)
    logger.info("LangSmith tracing enabled (project=%s)", settings.langsmith_project)
    return True


@contextlib.contextmanager
def trace_span(name: str, *, enabled: bool, metadata: dict | None = None) -> Iterator[None]:
    """Best-effort LangSmith span around a block when tracing is enabled; otherwise a no-op.

    Any failure (LangSmith absent, version mismatch) degrades silently to a plain block, so tracing
    can never break a request. Metadata should be content-free (ids/intents, not prompts).
    """
    if not enabled:
        yield
        return
    try:
        from langsmith import trace as ls_trace  # imported lazily; only when enabled

        with ls_trace(name=name, metadata=metadata or {}):
            yield
    except Exception as err:  # pragma: no cover - external tracer, never exercised in tests
        logger.warning("LangSmith span failed (%s); continuing untraced", type(err).__name__)
        yield


def record_run(
    db: Session,
    *,
    actor_id: int,
    kind: str,
    intent: str = "",
    tools: Sequence[str] = (),
    provider: str = "",
    latency_ms: int = 0,
    outcome: str = "ok",
) -> None:
    """Append a content-free agent-run trace. Never raises into the request path (Contract 2/3)."""
    try:
        db.add(
            AgentRun(
                actor_id=actor_id,
                kind=kind,
                intent=intent,
                tools=list(tools),
                provider=provider,
                latency_ms=latency_ms,
                outcome=outcome,
            )
        )
        db.commit()
    except Exception as err:
        logger.warning("failed to record agent run: %s", type(err).__name__)
        db.rollback()


def monotonic_ms() -> float:
    """A start marker; subtract from a later call and multiply isn't needed — use elapsed_ms."""
    return time.monotonic()


def elapsed_ms(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
