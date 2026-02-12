"""Helpers for canonical WebSocket message envelope shape."""

from __future__ import annotations

from typing import Any, Dict, Optional


def attach_context_fields(
    message: Dict[str, Any],
    context: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Attach optional session/conversation/user context to an existing transport message.
    """
    if not context:
        return message

    session_id = context.get("session_id")
    user_id = context.get("user_id")
    conversation_ref = context.get("conversation_ref")
    turn_ref = context.get("turn_ref")
    if session_id:
        message["session_id"] = session_id
    if user_id:
        message["user_id"] = user_id
    if conversation_ref:
        message["conversation_ref"] = conversation_ref
    if turn_ref:
        message["turn_ref"] = turn_ref
    return message


def build_transport_message(
    message_type: str,
    msg_id: Optional[str],
    payload: Dict[str, Any],
    *,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build the canonical WebSocket envelope and attach optional context.
    """
    message: Dict[str, Any] = {
        "type": message_type,
        "id": msg_id,
        "payload": payload,
    }
    return attach_context_fields(message, context)
