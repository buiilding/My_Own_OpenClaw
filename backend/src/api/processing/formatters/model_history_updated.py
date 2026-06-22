"""Formatter for model-history-updated events."""

from __future__ import annotations

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import (
    EventFormatter,
    EventInput,
    FormattedEvent,
)


class ModelHistoryUpdatedEventFormatter(EventFormatter):
    """Format backend-normalized model-history checkpoint updates."""

    message_type = OutgoingMessageType.MODEL_HISTORY_UPDATED

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        if not isinstance(event.rows, list):
            return None
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "conversation_ref": event.conversation_ref,
                "revision_id": event.revision_id,
                "checkpoint_id": event.checkpoint_id,
                "created_at": event.created_at,
                "rows": event.rows,
            },
        }
