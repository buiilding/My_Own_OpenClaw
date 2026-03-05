"""Cancellation reconciliation helpers for query execution."""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def finalize_pending_tool_calls_on_cancel(
    *,
    agent_instance: Any,
    msg_id: str,
    conversation_ref: Optional[str],
) -> None:
    """Best-effort reconciliation for cancelled turns with pending tool-call ids."""
    history = getattr(agent_instance, "history", None)
    finalize = getattr(history, "finalize_pending_tool_calls_as_cancelled", None)
    if not callable(finalize):
        return
    try:
        reconciled_count = int(finalize() or 0)
    except Exception as exc:
        logger.warning(
            "[Query Cancelled] Failed to reconcile pending tool calls "
            "(user_id=%s, session_id=%s, turn_ref=%s, conversation_ref=%s): %s",
            getattr(agent_instance, "user_id", "unknown"),
            getattr(agent_instance, "session_id", "unknown"),
            msg_id,
            conversation_ref,
            exc,
        )
        return
    if reconciled_count > 0:
        logger.info(
            "[Query Cancelled] Reconciled %s pending tool call(s) with synthetic "
            "tool outputs (user_id=%s, session_id=%s, turn_ref=%s, conversation_ref=%s)",
            reconciled_count,
            getattr(agent_instance, "user_id", "unknown"),
            getattr(agent_instance, "session_id", "unknown"),
            msg_id,
            conversation_ref,
        )
