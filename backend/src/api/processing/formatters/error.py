"""Formatter for error events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent
from backend.src.core.infrastructure.user_facing_errors import (
    sanitize_stream_error_message,
)


class ErrorEventFormatter(EventFormatter):
    """Formatter for error events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": OutgoingMessageType.ERROR,
            "id": msg_id,
            "payload": {
                "message": sanitize_stream_error_message(event_dict.get("content")),
            },
        }
