"""Formatter for context-compaction-failed events."""

from __future__ import annotations

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ContextCompactionFailedEventFormatter(EventFormatter):
    """Format compaction-failed lifecycle events for websocket transport."""
    message_type = OutgoingMessageType.CONTEXT_COMPACTION_FAILED

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        reason = self._get_required_field(
            event.reason,
            "reason",
            "ContextCompactionFailedEvent",
            msg_id,
        )
        strategy = self._get_required_field(
            event.strategy,
            "strategy",
            "ContextCompactionFailedEvent",
            msg_id,
        )
        error = self._get_required_field(
            event.error,
            "error",
            "ContextCompactionFailedEvent",
            msg_id,
        )
        if reason is None or strategy is None or error is None:
            return None

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "reason": reason,
                "strategy": strategy,
                "error": error,
                "before_tokens": event.before_tokens,
            },
        }
