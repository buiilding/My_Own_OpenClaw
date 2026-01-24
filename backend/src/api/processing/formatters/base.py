"""
Base Event Formatter.

Abstract base class for all event formatters.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union

from backend.src.core.events import AgentStreamingEvent, StreamingEvent

logger = __import__("logging").getLogger(__name__)


class EventFormatter(ABC):
    """Abstract base class for event formatters."""

    @abstractmethod
    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        """
        Format an event into a WebSocket response.

        Args:
            event: Event object (typed or dict) from agent
            msg_id: Message ID for response

        Returns:
            Formatted response dictionary or None if event should be skipped
        """
        pass
    
    def _get_event_dict(self, event: Union[AgentStreamingEvent, Dict[str, Any]]) -> Dict[str, Any]:
        """Convert event to dict if it's a typed event."""
        if isinstance(event, StreamingEvent):
            return event.to_dict()
        return event
