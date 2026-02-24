"""
Base Event Formatter.

Abstract base class for all event formatters.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union

from backend.src.core.events import AgentStreamingEvent, StreamingEvent

logger = __import__("logging").getLogger(__name__)

EventInput = Union[AgentStreamingEvent, Dict[str, Any]]
FormattedEvent = Optional[Dict[str, Any]]


class EventFormatter(ABC):
    """Abstract base class for event formatters."""

    @abstractmethod
    def format(self, event: EventInput, msg_id: str) -> FormattedEvent:
        """
        Format an event into a WebSocket response.

        Args:
            event: Event object (typed or dict) from agent
            msg_id: Message ID for response

        Returns:
            Formatted response dictionary or None if event should be skipped
        """
        pass
    
    def _get_event_dict(self, event: EventInput) -> Dict[str, Any]:
        """Convert event to dict if it's a typed event."""
        if isinstance(event, StreamingEvent):
            return event.to_dict()
        return event

    def _get_required_field(
        self,
        event_dict: Dict[str, Any],
        field_name: str,
        event_name: str,
        msg_id: str,
    ) -> Any:
        """Return a required field value, logging and returning None if missing."""
        value = event_dict.get(field_name)
        if value is None:
            logger.warning(
                "%s missing required field '%s'. Skipping format (msg_id=%s)",
                event_name,
                field_name,
                msg_id,
            )
            return None
        return value

    def _log_missing_fields(self, event_name: str, missing_fields: list[str], msg_id: str) -> None:
        """Log missing required fields in a consistent format."""
        logger.warning(
            "%s missing required fields: %s. Skipping format (msg_id=%s)",
            event_name,
            missing_fields,
            msg_id,
        )
