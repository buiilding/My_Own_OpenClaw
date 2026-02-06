"""
Response Formatter for Query Handler.

Formats agent events into WebSocket response messages.
"""
from typing import Any, Dict, Optional, Union

from backend.src.core.events import (
    AgentStreamingEvent,
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
    MemoryStoreEvent,
    ToolBundleEvent,
)
from backend.src.core.types import StreamingEventType

from backend.src.api.processing.formatters.base import EventFormatter
from backend.src.api.processing.formatters.thinking import ThinkingEventFormatter
from backend.src.api.processing.formatters.chunk import ChunkEventFormatter
from backend.src.api.processing.formatters.error import ErrorEventFormatter
from backend.src.api.processing.formatters.complete import StreamingCompleteEventFormatter
from backend.src.api.processing.formatters.tool_call import ToolCallEventFormatter
from backend.src.api.processing.formatters.tool_output import ToolOutputEventFormatter
from backend.src.api.processing.formatters.system_prompt import SystemPromptEventFormatter
from backend.src.api.processing.formatters.tool_schemas import ToolSchemasEventFormatter
from backend.src.api.processing.formatters.user_message import UserMessageFullEventFormatter
from backend.src.api.processing.formatters.assistant_message import AssistantMessageFullEventFormatter
from backend.src.api.processing.formatters.token_count import TokenCountEventFormatter
from backend.src.api.processing.formatters.memory_store import MemoryStoreEventFormatter
from backend.src.api.processing.formatters.tool_bundle import ToolBundleEventFormatter


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
            StreamingEventType.MEMORY_STORE.value: MemoryStoreEventFormatter(),
            StreamingEventType.TOOL_BUNDLE.value: ToolBundleEventFormatter(),
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
            MemoryStoreEvent: StreamingEventType.MEMORY_STORE.value,
            ToolBundleEvent: StreamingEventType.TOOL_BUNDLE.value,
        }

    def format(
        self,
        event: Union[AgentStreamingEvent, Dict[str, Any]],
        msg_id: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
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
            response = self._formatters[event_type].format(event, msg_id)
            return self._attach_context(response, context)
        
        # Backward compatibility with dict events
        if isinstance(event, dict):
            event_type = event.get("type")
            formatter = self._formatters.get(event_type)
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
        session_id = context.get("session_id")
        user_id = context.get("user_id")
        if session_id:
            response["session_id"] = session_id
        if user_id:
            response["user_id"] = user_id
        return response
