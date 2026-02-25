"""Formatter for context-compaction-completed events."""

from __future__ import annotations

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ContextCompactionCompletedEventFormatter(EventFormatter):
    """Format compaction-completed lifecycle events for websocket transport."""

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        reason = self._get_required_field(
            event_dict,
            "reason",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        strategy = self._get_required_field(
            event_dict,
            "strategy",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        before_tokens = self._get_required_field(
            event_dict,
            "before_tokens",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        after_tokens = self._get_required_field(
            event_dict,
            "after_tokens",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        removed_messages = self._get_required_field(
            event_dict,
            "removed_messages",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        if (
            reason is None
            or strategy is None
            or before_tokens is None
            or after_tokens is None
            or removed_messages is None
        ):
            return None

        return {
            "type": OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
            "id": msg_id,
            "payload": {
                "reason": reason,
                "strategy": strategy,
                "before_tokens": before_tokens,
                "after_tokens": after_tokens,
                "removed_messages": removed_messages,
                "summary_preview": event_dict.get("summary_preview"),
                "skipped_reason": event_dict.get("skipped_reason"),
            },
        }

