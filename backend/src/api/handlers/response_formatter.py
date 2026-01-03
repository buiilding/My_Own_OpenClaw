"""
Response Formatter for Query Handler.

Formats agent events into WebSocket response messages.
"""
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union

from backend.src.core.events import (
    AgentStreamingEvent,
    StreamingEvent,
    ThinkingEvent,
    ChunkEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    ToolCallEvent,
    ToolOutputEvent,
    SystemPromptEvent,
    ToolSchemasEvent,
    UserMessageFullEvent,
    AssistantMessageFullEvent,
    TokenCountEvent,
    RequestScreenshotEvent,
    MemoryStoreEvent,
)
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
        payload = {
            "tool_name": event_dict.get("tool_name"),
            "parameters": event_dict.get("parameters"),
            "raw_call": event_dict.get("raw_call"),
        }
        # Include request_id if present (for remote tools to match results)
        if event_dict.get("request_id"):
            payload["request_id"] = event_dict.get("request_id")
        
        return {
            "type": "tool-call",
            "id": msg_id,
            "payload": payload,
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


class ToolSchemasEventFormatter(EventFormatter):
    """Formatter for tool schemas events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "tool-schemas",
            "id": msg_id,
            "payload": {
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


class RequestScreenshotEventFormatter(EventFormatter):
    """Formatter for request screenshot events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "request-screenshot",
            "id": msg_id,
            "payload": {
                "request_id": event_dict.get("request_id"),
            },
        }


class MemoryStoreEventFormatter(EventFormatter):
    """Formatter for memory store events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        return {
            "type": "memory-store",
            "id": msg_id,
            "payload": {
                "user_query": event_dict.get("user_query"),
                "assistant_response": event_dict.get("assistant_response"),
                "memory_type": event_dict.get("memory_type"),
                "user_id": event_dict.get("user_id", "default_user"),
                "session_id": event_dict.get("session_id"),  # Track conversation window
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
            StreamingEventType.TOOL_SCHEMAS.value: ToolSchemasEventFormatter(),
            StreamingEventType.USER_MESSAGE_FULL.value: UserMessageFullEventFormatter(),
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value: AssistantMessageFullEventFormatter(),
            StreamingEventType.TOKEN_COUNT.value: TokenCountEventFormatter(),
            StreamingEventType.REQUEST_SCREENSHOT.value: RequestScreenshotEventFormatter(),
            StreamingEventType.MEMORY_STORE.value: MemoryStoreEventFormatter(),
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
        # Use isinstance checks for type-safe dispatch
        if isinstance(event, ThinkingEvent):
            return self._formatters[StreamingEventType.THINKING.value].format(event, msg_id)
        elif isinstance(event, ChunkEvent):
            return self._formatters[StreamingEventType.CHUNK.value].format(event, msg_id)
        elif isinstance(event, ErrorEvent):
            return self._formatters[StreamingEventType.ERROR.value].format(event, msg_id)
        elif isinstance(event, StreamingCompleteEvent):
            return self._formatters[StreamingEventType.STREAMING_COMPLETE.value].format(event, msg_id)
        elif isinstance(event, ToolCallEvent):
            return self._formatters[StreamingEventType.TOOL_CALL.value].format(event, msg_id)
        elif isinstance(event, ToolOutputEvent):
            return self._formatters[StreamingEventType.TOOL_OUTPUT.value].format(event, msg_id)
        elif isinstance(event, SystemPromptEvent):
            return self._formatters[StreamingEventType.SYSTEM_PROMPT.value].format(event, msg_id)
        elif isinstance(event, ToolSchemasEvent):
            return self._formatters[StreamingEventType.TOOL_SCHEMAS.value].format(event, msg_id)
        elif isinstance(event, UserMessageFullEvent):
            return self._formatters[StreamingEventType.USER_MESSAGE_FULL.value].format(event, msg_id)
        elif isinstance(event, AssistantMessageFullEvent):
            return self._formatters[StreamingEventType.ASSISTANT_MESSAGE_FULL.value].format(event, msg_id)
        elif isinstance(event, TokenCountEvent):
            return self._formatters[StreamingEventType.TOKEN_COUNT.value].format(event, msg_id)
        elif isinstance(event, RequestScreenshotEvent):
            return self._formatters[StreamingEventType.REQUEST_SCREENSHOT.value].format(event, msg_id)
        elif isinstance(event, MemoryStoreEvent):
            return self._formatters[StreamingEventType.MEMORY_STORE.value].format(event, msg_id)
        elif isinstance(event, dict):
            # Backward compatibility with dict events
            event_type = event.get("type")
            formatter = self._formatters.get(event_type)
            if formatter:
                return formatter.format(event, msg_id)
        
        return None
