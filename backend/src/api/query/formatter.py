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
    BundleStartEvent,
    BundleEndEvent,
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


class ChunkEventFormatter(EventFormatter):
    """Formatter for streaming chunk events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        content = event_dict.get("content")
        
        if content is None:
            logger.warning(
                f"ChunkEvent missing required field 'content'. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        return {
            "type": "streaming-response",
            "id": msg_id,
            "payload": {"text": content},
        }


class ErrorEventFormatter(EventFormatter):
    """Formatter for error events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        # FIX: Map content to 'message' to match ErrorPayload schema
        # schema.py: class ErrorPayload(BaseModel): message: str; content: Optional[str]
        return {
            "type": "error",
            "id": msg_id,
            "payload": {
                "message": event_dict.get("content", "An unexpected error occurred"),
                "content": event_dict.get("details")  # Map extra details if available
            },
        }


class StreamingCompleteEventFormatter(EventFormatter):
    """Formatter for streaming complete events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        return {"type": "streaming-complete", "id": msg_id, "payload": {}}


class ToolCallEventFormatter(EventFormatter):
    """Formatter for tool call events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        event_dict = self._get_event_dict(event)
        
        # Validate required fields
        tool_name = event_dict.get("tool_name")
        parameters = event_dict.get("parameters")
        raw_call = event_dict.get("raw_call")
        
        if not tool_name or not parameters or not raw_call:
            # Missing required fields - log warning and skip formatting
            missing_fields = []
            if not tool_name:
                missing_fields.append("tool_name")
            if not parameters:
                missing_fields.append("parameters")
            if not raw_call:
                missing_fields.append("raw_call")
            
            logger.warning(
                f"ToolCallEvent missing required fields: {missing_fields}. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        payload = {
            "tool_name": tool_name,
            "parameters": parameters,
            "raw_call": raw_call,
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
        
        # Validate required fields
        tool_name = event_dict.get("tool_name")
        success = event_dict.get("success")
        output = event_dict.get("output")
        
        if tool_name is None or success is None or output is None:
            # Missing required fields - log warning and skip formatting
            missing_fields = []
            if tool_name is None:
                missing_fields.append("tool_name")
            if success is None:
                missing_fields.append("success")
            if output is None:
                missing_fields.append("output")
            
            logger.warning(
                f"ToolOutputEvent missing required fields: {missing_fields}. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        return {
            "type": "tool-output",
            "id": msg_id,
            "payload": {
                "tool_name": tool_name,
                "success": success,
                "execution_time": event_dict.get("execution_time"),
                "output": output,
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
        content = event_dict.get("content")
        
        if content is None:
            logger.warning(
                f"AssistantMessageFullEvent missing required field 'content'. "
                f"Skipping format (msg_id={msg_id})"
            )
            return None
        
        return {
            "type": "assistant-message-full",
            "id": msg_id,
            "payload": {
                "content": content,
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


class BundleStartEventFormatter(EventFormatter):
    """Formatter for bundle start events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        return {
            "type": "bundle_start",
            "id": msg_id,
            "payload": {},
        }


class BundleEndEventFormatter(EventFormatter):
    """Formatter for bundle end events."""

    def format(self, event: Union[AgentStreamingEvent, Dict[str, Any]], msg_id: str) -> Optional[Dict[str, Any]]:
        return {
            "type": "bundle_end",
            "id": msg_id,
            "payload": {},
        }


class ResponseFormatter:
    """
    Formats agent events into WebSocket response messages.
    
    Uses strategy pattern with individual formatter classes for each event type.
    Uses O(1) dispatch table for efficient event type routing.
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
            StreamingEventType.BUNDLE_START.value: BundleStartEventFormatter(),
            StreamingEventType.BUNDLE_END.value: BundleEndEventFormatter(),
        }
        
        # Dispatch table: event class -> formatter key (for O(1) lookup)
        self._event_type_map: Dict[type, str] = {
            ThinkingEvent: StreamingEventType.THINKING.value,
            ChunkEvent: StreamingEventType.CHUNK.value,
            ErrorEvent: StreamingEventType.ERROR.value,
            StreamingCompleteEvent: StreamingEventType.STREAMING_COMPLETE.value,
            ToolCallEvent: StreamingEventType.TOOL_CALL.value,
            ToolOutputEvent: StreamingEventType.TOOL_OUTPUT.value,
            SystemPromptEvent: StreamingEventType.SYSTEM_PROMPT.value,
            ToolSchemasEvent: StreamingEventType.TOOL_SCHEMAS.value,
            UserMessageFullEvent: StreamingEventType.USER_MESSAGE_FULL.value,
            AssistantMessageFullEvent: StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
            TokenCountEvent: StreamingEventType.TOKEN_COUNT.value,
            RequestScreenshotEvent: StreamingEventType.REQUEST_SCREENSHOT.value,
            MemoryStoreEvent: StreamingEventType.MEMORY_STORE.value,
            BundleStartEvent: StreamingEventType.BUNDLE_START.value,
            BundleEndEvent: StreamingEventType.BUNDLE_END.value,
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
        # O(1) dispatch for typed events using dispatch table
        event_type = self._event_type_map.get(type(event))
        if event_type:
            return self._formatters[event_type].format(event, msg_id)
        
        # Backward compatibility with dict events
        if isinstance(event, dict):
            event_type = event.get("type")
            formatter = self._formatters.get(event_type)
            if formatter:
                return formatter.format(event, msg_id)
        
        return None
