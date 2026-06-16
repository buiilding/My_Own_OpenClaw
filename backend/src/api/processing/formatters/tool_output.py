"""Formatter for tool output events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ToolOutputEventFormatter(EventFormatter):
    """Formatter for tool output events."""
    message_type = OutgoingMessageType.TOOL_OUTPUT

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        tool_name = event.tool_name
        success = event.success
        
        if tool_name is None or success is None:
            # Missing required fields - log warning and skip formatting
            missing_fields = []
            if tool_name is None:
                missing_fields.append("tool_name")
            if success is None:
                missing_fields.append("success")
            
            self._log_missing_fields("ToolOutputEvent", missing_fields, msg_id)
            return None
        
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": {
                "tool_name": tool_name,
                "success": success,
                "execution_time": event.execution_time,
                "output": event.output,
                "error": event.error,
                "screenshot": event.screenshot,
                "metadata": event.metadata,
            },
        }
