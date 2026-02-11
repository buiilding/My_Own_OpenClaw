"""Formatter for streaming complete events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class StreamingCompleteEventFormatter(EventFormatter):
    """Formatter for streaming complete events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        return {
            "type": OutgoingMessageType.STREAMING_COMPLETE,
            "id": msg_id,
            "payload": {},
        }
