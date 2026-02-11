"""Formatter for full user message events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class UserMessageFullEventFormatter(EventFormatter):
    """Formatter for full user message events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": OutgoingMessageType.USER_MESSAGE_FULL,
            "id": msg_id,
            "payload": {
                "content": event_dict.get("content"),
                "metadata": event_dict.get("metadata"),
            },
        }
