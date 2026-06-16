"""Formatter for system prompt events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class SystemPromptEventFormatter(EventFormatter):
    """Formatter for system prompt events."""

    message_type = OutgoingMessageType.SYSTEM_PROMPT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "content": event.content,
                "tool_schemas": event.tool_schemas,
                "client_prompt_layers": event.client_prompt_layers,
            },
        }
