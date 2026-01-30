"""Formatter for memory store events."""
import logging
from typing import Any, Dict, Optional, Union

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.core.events import AgentStreamingEvent

logger = logging.getLogger(__name__)


class MemoryStoreEventFormatter(EventFormatter):
    """Formatter for memory store events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        user_id = event_dict.get("user_id")
        # FIX #2: Reject default_user - security policy violation
        if not user_id or user_id == "default_user":
            logger.warning(f"MemoryStoreEvent missing or invalid user_id (msg_id={msg_id}), skipping")
            return None
        return {
            "type": "memory-store",
            "id": msg_id,
            "payload": {
                "user_query": event_dict.get("user_query"),
                "assistant_response": event_dict.get("assistant_response"),
                "memory_type": event_dict.get("memory_type"),
                "user_id": user_id,
                "session_id": event_dict.get("session_id"),  # Track conversation window
            },
        }
