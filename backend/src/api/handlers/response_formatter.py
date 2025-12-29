"""
Response Formatter for Query Handler.

Formats agent events into WebSocket response messages.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union

from backend.src.core.events import AgentStreamingEvent, StreamingEvent
from backend.src.core.types import StreamingEventType

logger = logging.getLogger(__name__)


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


class ThinkingEventFormatter(EventFormatter):
    """Formatter for thinking events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "llm-thought",
            "id": msg_id,
            "payload": {"status": event_dict["content"]},
        }


class ChunkEventFormatter(EventFormatter):
    """Formatter for streaming chunk events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "streaming-response",
            "id": msg_id,
            "payload": {"text": event_dict["content"]},
        }


class ErrorEventFormatter(EventFormatter):
    """Formatter for error events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "error",
            "id": msg_id,
            "payload": {"content": event_dict.get("content", "Error")},
        }


class StreamingCompleteEventFormatter(EventFormatter):
    """Formatter for streaming complete events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        return {"type": "streaming-complete", "id": msg_id, "payload": {}}


class ToolCallEventFormatter(EventFormatter):
    """Formatter for tool call events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "tool-call",
            "id": msg_id,
            "payload": {
                "tool_name": event_dict.get("tool_name"),
                "parameters": event_dict.get("parameters"),
                "raw_call": event_dict.get("raw_call"),
            },
        }


class ToolOutputEventFormatter(EventFormatter):
    """Formatter for tool output events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "tool-output",
            "id": msg_id,
            "payload": {
                "tool_name": event_dict.get("tool_name"),
                "success": event_dict.get("success"),
                "execution_time": event_dict.get("execution_time"),
                "output": event_dict.get("output"),
                "error": event_dict.get("error"),
                "screenshot": event_dict.get("screenshot"),
                "metadata": event_dict.get("metadata"),
            },
        }


class SystemPromptEventFormatter(EventFormatter):
    """Formatter for system prompt events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "system-prompt",
            "id": msg_id,
            "payload": {
                "content": event_dict.get("content"),
                "tool_schemas": event_dict.get("tool_schemas"),
            },
        }


class UserMessageFullEventFormatter(EventFormatter):
    """Formatter for full user message events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "user-message-full",
            "id": msg_id,
            "payload": {
                "content": event_dict.get("content"),
                "metadata": event_dict.get("metadata"),
            },
        }


class AssistantMessageFullEventFormatter(EventFormatter):
    """Formatter for full assistant message events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "assistant-message-full",
            "id": msg_id,
            "payload": {
                "content": event_dict.get("content"),
            },
        }


class ResponseFormatter:
    """
    Formats agent events into WebSocket response messages.
    
    Uses strategy pattern with individual formatter classes for each event type.
    """

    def __init__(self):
        """Initialize the formatter with a registry of event formatters."""
        self._formatters: Dict[str, EventFormatter] = {
            StreamingEventType.THINKING.value: ThinkingEventFormatter(),
            StreamingEventType.CHUNK.value: ChunkEventFormatter(),
            StreamingEventType.ERROR.value: ErrorEventFormatter(),
            StreamingEventType.STREAMING_COMPLETE.value: StreamingCompleteEventFormatter(),
            StreamingEventType.TOOL_CALL.value: ToolCallEventFormatter(),
            StreamingEventType.TOOL_OUTPUT.value: ToolOutputEventFormatter(),
            StreamingEventType.SYSTEM_PROMPT.value: SystemPromptEventFormatter(),
            StreamingEventType.USER_MESSAGE_FULL.value: UserMessageFullEventFormatter(),
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value: AssistantMessageFullEventFormatter(),
        }

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        """
        Format agent event into WebSocket response.

        Args:
            event: Event object (typed or dict) from agent
            msg_id: Message ID for response

        Returns:
            Formatted response dictionary or None if event type not recognized
        """
        # Get event type from typed event or dict
        if isinstance(event, StreamingEvent):
            event_type = event.type.value
        else:
            event_type = event.get("type")
        
        formatter = self._formatters.get(event_type)
        
        if formatter:
            return formatter.format(event, msg_id)
        
        return None
