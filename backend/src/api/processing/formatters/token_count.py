"""Formatter for token count events."""
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent


class TokenCountEventFormatter(EventFormatter):
    """Formatter for token count events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "token-count",
            "id": msg_id,
            "payload": {
                "input_tokens": event_dict.get("input_tokens"),
                "output_tokens": event_dict.get("output_tokens"),
                "total_tokens": event_dict.get("total_tokens"),
                "conversation_tokens": event_dict.get("conversation_tokens"),
            },
        }
