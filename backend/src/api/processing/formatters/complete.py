"""Formatter for streaming complete events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class StreamingCompleteEventFormatter(EventFormatter):
    """Formatter for streaming complete events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        payload: Dict[str, Any] = {}
        final_response = event_dict.get("final_response")
        if isinstance(final_response, str):
            payload["final_response"] = final_response
        return {
            "type": OutgoingMessageType.STREAMING_COMPLETE,
            "id": msg_id,
            "payload": payload,
        }
