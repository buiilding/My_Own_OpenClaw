"""
Streaming Events.

This module provides streaming events for agent interaction loop and WebSocket communication.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

from backend.src.core.types.enums import StreamingEventType
from backend.src.core.types.schemas import ToolSchema


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
    final_response: Optional[str] = None
    
    def __post_init__(self):
        self.type = StreamingEventType.STREAMING_COMPLETE
    
    def to_dict(self) -> Dict[str, Any]:
        result = {"type": self.type.value}
        if self.final_response is not None:
            result["final_response"] = self.final_response
        return result


@dataclass
class ToolCallEvent(StreamingEvent):
    """Event emitted when a tool is called."""
    tool_name: str
    parameters: Dict[str, Any]
    request_id: Optional[str] = None  # For remote tools, the request_id to match results
    metadata: Optional[Dict[str, Any]] = None  # Metadata for computer-use tools (description, explanation, expectation)
    
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
    tool_schemas: Optional[List[ToolSchema]] = None
    
    def __post_init__(self):
        self.type = StreamingEventType.SYSTEM_PROMPT


@dataclass
class ToolSchemasEvent(StreamingEvent):
    """Event emitted with canonical tool schemas for transparency display."""
    tool_schemas: List[ToolSchema]

    def __post_init__(self):
        self.type = StreamingEventType.TOOL_SCHEMAS


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


@dataclass
class TokenCountEvent(StreamingEvent):
    """Event containing token usage information."""
    input_tokens: int
    output_tokens: int
    total_tokens: int
    conversation_tokens: int

    def __post_init__(self):
        self.type = StreamingEventType.TOKEN_COUNT


@dataclass
class MemoryStoreEvent(StreamingEvent):
    """Event emitted to trigger frontend memory storage after interaction completes."""
    user_query: str
    assistant_response: str
    memory_type: str  # "episodic" or "semantic"
    user_id: str = "default_user"
    session_id: Optional[str] = None  # Session/conversation identifier for grouping
    
    def __post_init__(self):
        self.type = StreamingEventType.MEMORY_STORE


@dataclass
class ToolBundleEvent(StreamingEvent):
    """Event emitted when a bundle of tools is ready for execution."""
    bundle_id: str
    tools: List[Dict[str, Any]]  # List of prepared tool definitions
    
    def __post_init__(self):
        self.type = StreamingEventType.TOOL_BUNDLE


# Union type for all event types
AgentStreamingEvent = Union[
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
    FullResponseEvent,
    MemoryStoreEvent,
    ToolBundleEvent,
]
