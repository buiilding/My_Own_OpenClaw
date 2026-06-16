"""Formatter for tool call events."""

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter, EventInput, FormattedEvent


class ToolCallEventFormatter(EventFormatter):
    """Formatter for tool call events."""
    message_type = OutgoingMessageType.TOOL_CALL

    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        tool_name = event.tool_name
        parameters = event.parameters

        missing_fields = []
        if not tool_name:
            missing_fields.append("tool_name")
        if parameters is None:
            missing_fields.append("parameters")
        elif not isinstance(parameters, dict):
            missing_fields.append("parameters(type)")

        if missing_fields:
            self._log_missing_fields("ToolCallEvent", missing_fields, msg_id)
            return None
        
        payload = {
            "tool_name": tool_name,
            "parameters": parameters,
        }
        # Include request_id if present (for remote tools to match results)
        if event.request_id:
            payload["request_id"] = event.request_id
        # Include metadata if present (for computer-use tools: description, explanation, expectation)
        if event.metadata:
            payload["metadata"] = event.metadata
        
        return {
            "type": self.message_type,
            "id": msg_id,
            "payload": payload,
        }
