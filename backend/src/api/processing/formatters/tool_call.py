"""Formatter for tool call events."""
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent

logger = logging.getLogger(__name__)


class ToolCallEventFormatter(EventFormatter):
    """Formatter for tool call events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        
        # Validate required fields
        tool_name = event_dict.get("tool_name")
        parameters = event_dict.get("parameters")
        raw_call = event_dict.get("raw_call")

        missing_fields = []
        if not tool_name:
            missing_fields.append("tool_name")
        if parameters is None:
            missing_fields.append("parameters")
        elif not isinstance(parameters, dict):
            missing_fields.append("parameters(type)")
        if not raw_call:
            missing_fields.append("raw_call")

        if missing_fields:
            # Missing required fields - log warning and skip formatting
            logger.warning(
                f"ToolCallEvent missing required fields: {missing_fields}. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        payload = {
            "tool_name": tool_name,
            "parameters": parameters,
            "raw_call": raw_call,
        }
        # Include request_id if present (for remote tools to match results)
        if event_dict.get("request_id"):
            payload["request_id"] = event_dict.get("request_id")
        # Include metadata if present (for computer-use tools: description, explanation, expectation)
        if event_dict.get("metadata"):
            payload["metadata"] = event_dict.get("metadata")
        
        return {
            "type": "tool-call",
            "id": msg_id,
            "payload": payload,
        }
