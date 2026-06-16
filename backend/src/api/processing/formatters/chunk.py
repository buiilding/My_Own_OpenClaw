"""Formatter for streaming chunk events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ChunkEventFormatter(EventFormatter):
    """Formatter for streaming chunk events."""
    message_type = OutgoingMessageType.STREAMING_RESPONSE

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        content = self._get_required_field(event.content, "content", "ChunkEvent", msg_id)
        if content is None:
            return None

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {"text": content},
        }
