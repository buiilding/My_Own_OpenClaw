"""Formatter for tool output events."""
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent

logger = logging.getLogger(__name__)


class ToolOutputEventFormatter(EventFormatter):
    """Formatter for tool output events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
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
            
            logger.warning(
                f"ToolOutputEvent missing required fields: {missing_fields}. "
                f"Skipping format (msg_id={msg_id})"
            )
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
