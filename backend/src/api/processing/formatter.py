"""
Response Formatter for Query Handler.

Formats agent events into WebSocket response messages.
"""
from copy import deepcopy

from typing import Any, Dict, Optional

from backend.src.api.contracts.formatter_specs import get_formatter_specs
from backend.src.core.events import (
    AgentStreamingEvent,
)
from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.api.transport.envelope import attach_context_fields


class ResponseFormatter:
    """
    Formats agent events into WebSocket response messages.

    Uses strategy pattern with individual formatter classes for each event type.
    Uses O(1) dispatch table for efficient event type routing.
    """

    def __init__(self):
        """Initialize the formatter with a registry of event formatters."""
        self._event_types: set[str] = set()
        self._typed_formatters: Dict[type, EventFormatter] = {}
        self._register_formatters()

    def _register_formatters(self) -> None:
        """Register typed formatter dispatch and validate event type uniqueness."""
        for event_cls, event_type, formatter_cls in get_formatter_specs():
            if event_type in self._event_types:
                raise ValueError(f"Duplicate formatter registration for type: {event_type}")
            if event_cls in self._typed_formatters:
                raise ValueError(f"Duplicate formatter registration for class: {event_cls}")
            formatter = formatter_cls()
            self._event_types.add(event_type)
            self._typed_formatters[event_cls] = formatter

    def format(
        self,
        event: AgentStreamingEvent,
        msg_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Format agent event into WebSocket response.

        Args:
            event: Typed event object from agent
            msg_id: Message ID for response

        Returns:
            Formatted response dictionary or None if event type not recognized
        """
        formatter = self._typed_formatters.get(type(event))
        if formatter:
            response = formatter.format(event, msg_id)
            return self._attach_context(response, context)

        return None

    def _attach_context(
        self,
        response: Optional[Dict[str, Any]],
        context: Optional[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not response or not context:
            return response
        return attach_context_fields(deepcopy(response), context)
