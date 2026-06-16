"""Formatter for thinking events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ThinkingEventFormatter(EventFormatter):
    """Formatter for thinking events."""
    message_type = OutgoingMessageType.LLM_THOUGHT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        content = self._get_required_field(event.content, "content", "ThinkingEvent", msg_id)
        if content is None:
            return None

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {"status": content},
        }
