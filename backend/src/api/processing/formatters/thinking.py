"""Formatter for thinking events."""
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent

logger = logging.getLogger(__name__)


class ThinkingEventFormatter(EventFormatter):
    """Formatter for thinking events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        content = event_dict.get("content")
        
        if content is None:
            logger.warning(
                f"ThinkingEvent missing required field 'content'. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        return {
            "type": "llm-thought",
            "id": msg_id,
            "payload": {"status": content},
        }
