"""Formatter for system prompt events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class SystemPromptEventFormatter(EventFormatter):
    """Formatter for system prompt events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "system-prompt",
            "id": msg_id,
            "payload": {
                "content": event_dict.get("content"),
                "tool_schemas": event_dict.get("tool_schemas"),
            },
        }
