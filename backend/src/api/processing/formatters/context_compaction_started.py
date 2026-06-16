"""Formatter for context-compaction-started events."""

from __future__ import annotations

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ContextCompactionStartedEventFormatter(EventFormatter):
    """Format compaction-start lifecycle events for websocket transport."""
    message_type = OutgoingMessageType.CONTEXT_COMPACTION_STARTED

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        reason = self._get_required_field(
            event.reason,
            "reason",
            "ContextCompactionStartedEvent",
            msg_id,
        )
        strategy = self._get_required_field(
            event.strategy,
            "strategy",
            "ContextCompactionStartedEvent",
            msg_id,
        )
        before_tokens = self._get_required_field(
            event.before_tokens,
            "before_tokens",
            "ContextCompactionStartedEvent",
            msg_id,
        )
        projected_tokens = self._get_required_field(
            event.projected_tokens,
            "projected_tokens",
            "ContextCompactionStartedEvent",
            msg_id,
        )
        if (
            reason is None
            or strategy is None
            or before_tokens is None
            or projected_tokens is None
        ):
            return None

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "reason": reason,
                "strategy": strategy,
                "before_tokens": before_tokens,
                "projected_tokens": projected_tokens,
            },
        }
