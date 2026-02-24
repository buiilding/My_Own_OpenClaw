"""Formatter for tool output events."""
from typing import Any, Dict

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ToolOutputEventFormatter(EventFormatter):
    """Formatter for tool output events."""

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        event_dict = self._get_event_dict(event)
        
        # Validate required fields
        tool_name = event_dict.get("tool_name")
        success = event_dict.get("success")
        output = event_dict.get("output")
        
        if tool_name is None or success is None or output is None:
            # Missing required fields - log warning and skip formatting
            missing_fields = []
            if tool_name is None:
                missing_fields.append("tool_name")
            if success is None:
                missing_fields.append("success")
            if output is None:
                missing_fields.append("output")
            
            self._log_missing_fields("ToolOutputEvent", missing_fields, msg_id)
            return None
        
        return {
            "type": OutgoingMessageType.TOOL_OUTPUT,
            "id": msg_id,
            "payload": {
                "tool_name": tool_name,
                "success": success,
                "execution_time": event_dict.get("execution_time"),
                "output": output,
                "error": event_dict.get("error"),
                "screenshot": event_dict.get("screenshot"),
                "metadata": event_dict.get("metadata"),
            },
        }
