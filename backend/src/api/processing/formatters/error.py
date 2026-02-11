"""Formatter for error events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class ErrorEventFormatter(EventFormatter):
    """Formatter for error events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        # FIX: Map content to 'message' to match ErrorPayload schema
        # schema.py: class ErrorPayload(BaseModel): message: str; content: Optional[str]
        return {
            "type": OutgoingMessageType.ERROR,
            "id": msg_id,
            "payload": {
                "message": event_dict.get("content", "An unexpected error occurred"),
                "content": event_dict.get("details")  # Map extra details if available
            },
        }
