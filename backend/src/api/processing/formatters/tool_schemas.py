"""Formatter for tool schemas events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class ToolSchemasEventFormatter(EventFormatter):
    """Formatter for tool schemas events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "tool-schemas",
            "id": msg_id,
            "payload": {
                "tool_schemas": event_dict.get("tool_schemas"),
            },
        }
