"""Formatter for full assistant message events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class AssistantMessageFullEventFormatter(EventFormatter):
    """Formatter for full assistant message events."""
    message_type = OutgoingMessageType.ASSISTANT_MESSAGE_FULL

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        content = self._get_required_field(
            event.content,
            "content",
            "AssistantMessageFullEvent",
            msg_id,
        )
        if content is None:
            return None

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "content": content,
            },
        }
