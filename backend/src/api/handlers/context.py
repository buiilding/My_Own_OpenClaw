"""Shared helpers for websocket handler context fields."""

from __future__ import annotations

from typing import Any


def build_user_session_context(*, user_id: str, session: Any | None) -> dict[str, Any]:
    """Build common response context fields for handler responses."""
    context: dict[str, Any] = {"user_id": user_id}
    session_id = getattr(session, "session_id", None)
    if isinstance(session_id, str):
        normalized_session_id = session_id.strip()
        if normalized_session_id:
            context["session_id"] = normalized_session_id
    runtime = getattr(session, "runtime", None)
    if runtime is not None:
        conversation_ref = getattr(runtime, "active_conversation_ref", None)
        if isinstance(conversation_ref, str):
            normalized_conversation_ref = conversation_ref.strip()
            if normalized_conversation_ref:
                context["conversation_ref"] = normalized_conversation_ref
    return context
