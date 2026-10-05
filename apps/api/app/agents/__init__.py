"""Agentic features (AC38–AC40): the LangGraph Content Assistant + discovery tools.

Everything here is grounded in, and scoped to, what the acting agent may actually see — the tools go
through ``app.services.visibility`` (Contract 1 / AC6), so the assistant can never surface or speak
about content outside the agent's permissions, and never invents content that isn't in the library.
"""
