"""Formatter for tool schemas events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class ToolSchemasEventFormatter(EventFormatter):
    """Formatter for tool schemas events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        tool_schemas = event_dict.get("tool_schemas")
        if not isinstance(tool_schemas, list):
            raise ValueError("tool_schemas event payload must be a canonical tool object list")

        return {
            "type": OutgoingMessageType.TOOL_SCHEMAS,
            "id": msg_id,
            "payload": {
                "tool_schemas": tool_schemas,
            },
        }
