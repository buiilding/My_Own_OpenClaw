"""Formatter for error events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent
from backend.src.core.infrastructure.user_facing_errors import (
    sanitize_stream_error_message,
)


class ErrorEventFormatter(EventFormatter):
    """Formatter for error events."""
    message_type = OutgoingMessageType.ERROR

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        payload = {
            "message": sanitize_stream_error_message(event.content),
        }
        metadata = event.metadata
        if isinstance(metadata, dict):
            payload["metadata"] = metadata
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
