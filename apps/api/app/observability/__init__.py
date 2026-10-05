"""Observability (AC45): an always-on, content-free in-app agent-run trace, plus optional LangSmith
tracing of the agent loop — env-gated and off by default (no key → no egress, hermetic tests)."""

from app.observability.tracing import configure_langsmith, record_run, trace_span

__all__ = ["configure_langsmith", "record_run", "trace_span"]
