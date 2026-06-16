"""Formatter for tool schemas events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ToolSchemasEventFormatter(EventFormatter):
    """Formatter for tool schemas events."""
    message_type = OutgoingMessageType.TOOL_SCHEMAS

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        tool_schemas = event.tool_schemas
        if not isinstance(tool_schemas, list):
            raise ValueError("tool_schemas event payload must be a canonical tool object list")

        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "tool_schemas": tool_schemas,
            },
        }
