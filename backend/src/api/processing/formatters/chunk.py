"""Formatter for streaming chunk events."""
from typing import Any, Dict

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ChunkEventFormatter(EventFormatter):
    """Formatter for streaming chunk events."""

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        content = self._get_required_field(event_dict, "content", "ChunkEvent", msg_id)
        if content is None:
            return None

        return {
            "type": OutgoingMessageType.STREAMING_RESPONSE,
            "id": msg_id,
            "payload": {"text": content},
        }
