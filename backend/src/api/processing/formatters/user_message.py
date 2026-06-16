"""Formatter for full user message events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class UserMessageFullEventFormatter(EventFormatter):
    """Formatter for full user message events."""
    message_type = OutgoingMessageType.USER_MESSAGE_FULL

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "content": event.content,
                "metadata": event.metadata,
            },
        }
