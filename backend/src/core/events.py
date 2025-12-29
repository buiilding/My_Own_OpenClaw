"""
Structured Event System for Agent Streaming and Event Bus.

This module provides typed dataclass-based events for:
1. Agent streaming events (for WebSocket communication)
2. Event bus events (for internal component communication)
"""
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from backend.src.core.types import StreamingEventType


# ============================================================================
# Event Bus Events (for internal component communication)
# ============================================================================

class Event:
    """Base class for all event bus events."""
    def __init__(self, timestamp: Optional[float] = None):
        """Initialize event with optional timestamp."""
        self.timestamp = timestamp if timestamp is not None else time.time()


@dataclass
class InteractionCompleted(Event):
    """Event fired when a conversation turn completes."""
    session_id: str
    user_id: str
    user_message: str
    assistant_response: str
    timestamp: Optional[float] = None
    
    def __post_init__(self):
        """Initialize parent and set timestamp."""
        super().__init__(self.timestamp)


@dataclass
class ConfigChanged(Event):
    """Event fired when configuration is updated."""
    old_config: Dict[str, Any]
    new_config: Dict[str, Any]
    timestamp: Optional[float] = None
    
    def __post_init__(self):
        """Initialize parent and set timestamp."""
        super().__init__(self.timestamp)


# ============================================================================
# Streaming Events (for agent interaction loop and WebSocket communication)
# ============================================================================


@dataclass
class StreamingEvent:
    """Base class for all streaming events."""
    type: StreamingEventType = field(init=False)  # Set in __post_init__ by subclasses
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary format for serialization."""
        result = {"type": self.type.value}
        for key, value in self.__dict__.items():
            if key != "type":
                if isinstance(value, dict):
                    result[key] = value
                elif isinstance(value, list):
                    result[key] = value
                else:
                    result[key] = value
        return result


@dataclass
class ThinkingEvent(StreamingEvent):
    """Event emitted during LLM thinking/reasoning."""
    content: str
    
    def __post_init__(self):
        self.type = StreamingEventType.THINKING


@dataclass
class ChunkEvent(StreamingEvent):
    """A single chunk from streaming LLM response."""
    content: str
    
    def __post_init__(self):
        self.type = StreamingEventType.CHUNK


@dataclass
class ErrorEvent(StreamingEvent):
    """Event emitted when an error occurs."""
    content: str
    
    def __post_init__(self):
        self.type = StreamingEventType.ERROR


@dataclass
class StreamingCompleteEvent(StreamingEvent):
    """Event emitted when streaming is complete."""
    
    def __post_init__(self):
        self.type = StreamingEventType.STREAMING_COMPLETE
    
    def to_dict(self) -> Dict[str, Any]:
        return {"type": self.type.value}


@dataclass
class ToolCallEvent(StreamingEvent):
    """Event emitted when a tool is called."""
    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str
    
    def __post_init__(self):
        self.type = StreamingEventType.TOOL_CALL


@dataclass
class ToolOutputEvent(StreamingEvent):
    """Event emitted when a tool execution completes."""
    tool_name: str
    success: bool
    output: str
    execution_time: Optional[float] = None
    error: Optional[str] = None
    screenshot: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        self.type = StreamingEventType.TOOL_OUTPUT


@dataclass
class SystemPromptEvent(StreamingEvent):
    """Event emitted with full system prompt sent to LLM."""
    content: str
    tool_schemas: Optional[Dict[str, Any]] = None
    
    def __post_init__(self):
        self.type = StreamingEventType.SYSTEM_PROMPT


@dataclass
class UserMessageFullEvent(StreamingEvent):
    """Event emitted with full user message including injected context."""
    content: str
    metadata: Dict[str, Any]
    
    def __post_init__(self):
        self.type = StreamingEventType.USER_MESSAGE_FULL


@dataclass
class AssistantMessageFullEvent(StreamingEvent):
    """Event emitted with complete assistant response."""
    content: str
    
    def __post_init__(self):
        self.type = StreamingEventType.ASSISTANT_MESSAGE_FULL


@dataclass
class FullResponseEvent(StreamingEvent):
    """Event emitted with full LLM response (internal use)."""
    content: str
    
    def __post_init__(self):
        self.type = StreamingEventType.FULL_RESPONSE


# Union type for all event types
AgentStreamingEvent = Union[
    ThinkingEvent,
    ChunkEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    ToolCallEvent,
    ToolOutputEvent,
    SystemPromptEvent,
    UserMessageFullEvent,
    AssistantMessageFullEvent,
    FullResponseEvent,
]
