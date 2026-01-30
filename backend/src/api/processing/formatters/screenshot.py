"""Formatter for request screenshot events."""
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent

logger = logging.getLogger(__name__)


class RequestScreenshotEventFormatter(EventFormatter):
    """Formatter for request screenshot events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        request_id = event_dict.get("request_id")
        
        if not request_id:
            logger.warning(
                f"RequestScreenshotEvent missing required field 'request_id'. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        return {
            "type": "request-screenshot",
            "id": msg_id,
            "payload": {
                "request_id": request_id,
            },
        }
