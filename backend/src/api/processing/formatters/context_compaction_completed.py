"""Formatter for context-compaction-completed events."""

from __future__ import annotations

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ContextCompactionCompletedEventFormatter(EventFormatter):
    """Format compaction-completed lifecycle events for websocket transport."""
    message_type = OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        reason = self._get_required_field(
            event.reason,
            "reason",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        strategy = self._get_required_field(
            event.strategy,
            "strategy",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        before_tokens = self._get_required_field(
            event.before_tokens,
            "before_tokens",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        after_tokens = self._get_required_field(
            event.after_tokens,
            "after_tokens",
            "ContextCompactionCompletedEvent",
            msg_id,
        )
        removed_messages = self._get_required_field(
            event.removed_messages,
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
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "reason": reason,
                "strategy": strategy,
                "before_tokens": before_tokens,
                "after_tokens": after_tokens,
                "removed_messages": removed_messages,
                "summary_preview": event.summary_preview,
                "summary_text": event.summary_text,
                "replacement_history_preview": event.replacement_history_preview,
                "replacement_history_entries": event.replacement_history_entries,
                "skipped_reason": event.skipped_reason,
            },
        }
