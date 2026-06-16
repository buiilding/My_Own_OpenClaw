"""Formatter for streaming complete events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class StreamingCompleteEventFormatter(EventFormatter):
    """Formatter for streaming complete events."""
    message_type = OutgoingMessageType.STREAMING_COMPLETE

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        payload: dict[str, object] = {}
        final_response = event.final_response
        if isinstance(final_response, str):
            payload["final_response"] = final_response
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
