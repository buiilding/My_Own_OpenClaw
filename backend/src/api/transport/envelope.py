"""Helpers for canonical WebSocket message envelope shape."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class StreamEventSequencer:
    """Per-turn backend stream event identity generator."""

    turn_ref: str
    next_sequence: int = 1

    def next(self, message_type: str) -> Dict[str, Any]:
        sequence = self.next_sequence
        self.next_sequence += 1
        return {
            "turn_ref": self.turn_ref,
            "event_id": f"{self.turn_ref}-evt-{sequence:06d}-{message_type}",
            "sequence": sequence,
        }


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
    sequencer = context.get("stream_event_sequencer")
    if isinstance(sequencer, StreamEventSequencer):
        identity = sequencer.next(str(message.get("type") or "event"))
        message["turn_ref"] = identity["turn_ref"]
        message["event_id"] = identity["event_id"]
        message["sequence"] = identity["sequence"]
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
        "payload": deepcopy(payload),
    }
    return attach_context_fields(message, context)
