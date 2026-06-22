"""
Streaming Events.

This module provides streaming events for agent interaction loop and WebSocket communication.
"""

from dataclasses import asdict, dataclass, field, is_dataclass
from enum import Enum
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
                result[key] = _normalize_event_value(value)
        return result


def _normalize_event_value(value: Any) -> Any:
    """Recursively convert event payload values into JSON-compatible shapes."""
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {
            key: _normalize_event_value(nested_value)
            for key, nested_value in value.items()
        }
    if isinstance(value, list):
        return [_normalize_event_value(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_event_value(item) for item in value]
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _normalize_event_value(model_dump())
    if is_dataclass(value) and not isinstance(value, type):
        return _normalize_event_value(asdict(value))
    return value


@dataclass
class ThinkingEvent(StreamingEvent):
    """Event emitted during LLM thinking/reasoning."""

    content: str

    def __post_init__(self):
        self.type = StreamingEventType.LLM_THOUGHT


@dataclass
class ChunkEvent(StreamingEvent):
    """A single chunk from streaming LLM response."""

    content: str

    def __post_init__(self):
        self.type = StreamingEventType.STREAMING_RESPONSE


@dataclass
class ErrorEvent(StreamingEvent):
    """Event emitted when an error occurs."""

    content: str
    metadata: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        self.type = StreamingEventType.ERROR

    def to_dict(self) -> Dict[str, Any]:
        result = {"type": self.type.value, "content": self.content}
        if self.metadata is not None:
            result["metadata"] = self.metadata
        return result


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
    request_id: Optional[str] = (
        None  # For remote tools, the request_id to match results
    )
    metadata: Optional[Dict[str, Any]] = (
        None  # Metadata for computer-use tools (description, explanation, expectation)
    )

    def __post_init__(self):
        self.type = StreamingEventType.TOOL_CALL


@dataclass
class ToolOutputEvent(StreamingEvent):
    """Event emitted when a tool execution completes."""

    tool_name: str
    success: bool
    output: Any
    execution_time: Optional[float] = None
    error: Optional[str] = None
    screenshot: Optional[str] = None
    screenshot_ref: Optional[str] = None
    screenshot_url: Optional[str] = None
    screenshot_content_type: Optional[str] = None
    display_attachments: Optional[List[Dict[str, Any]]] = None
    metadata: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        self.type = StreamingEventType.TOOL_OUTPUT


@dataclass
class WebSearchProgressEvent(StreamingEvent):
    """Event emitted while provider-native web search actions are still running."""

    text: str
    request_id: Optional[str] = None
    action_type: Optional[str] = None
    query: Optional[str] = None
    url: Optional[str] = None
    pattern: Optional[str] = None

    def __post_init__(self):
        self.type = StreamingEventType.WEB_SEARCH_PROGRESS


@dataclass
class SystemPromptEvent(StreamingEvent):
    """Event emitted with full system prompt sent to LLM."""

    content: str
    tool_schemas: Optional[List[ToolSchema]] = None
    client_prompt_layers: Optional[List[Dict[str, Any]]] = None
    client_prompt_layer_summary: Optional[Dict[str, Any]] = None

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

    prompt_tokens: int
    visible_output_tokens: int
    thinking_tokens: Optional[int]
    output_tokens_total: int
    total_tokens: int
    conversation_tokens: int
    usage_source: str
    cached_tokens: Optional[int] = None
    cache_hit: Optional[bool] = None
    cache_status: Optional[str] = None

    def __post_init__(self):
        self.type = StreamingEventType.TOKEN_COUNT


@dataclass
class ContextCompactionStartedEvent(StreamingEvent):
    """Event emitted when history compaction starts."""

    reason: str
    strategy: str
    before_tokens: int
    projected_tokens: int

    def __post_init__(self):
        self.type = StreamingEventType.CONTEXT_COMPACTION_STARTED


@dataclass
class ContextCompactionCompletedEvent(StreamingEvent):
    """Event emitted when history compaction completes."""

    reason: str
    strategy: str
    before_tokens: int
    after_tokens: int
    removed_messages: int
    summary_preview: Optional[str] = None
    summary_text: Optional[str] = None
    replacement_history_preview: Optional[List[Dict[str, Any]]] = None
    replacement_history_entries: Optional[List[Dict[str, Any]]] = None
    skipped_reason: Optional[str] = None

    def __post_init__(self):
        self.type = StreamingEventType.CONTEXT_COMPACTION_COMPLETED


@dataclass
class ContextCompactionFailedEvent(StreamingEvent):
    """Event emitted when history compaction fails."""

    reason: str
    strategy: str
    error: str
    before_tokens: Optional[int] = None

    def __post_init__(self):
        self.type = StreamingEventType.CONTEXT_COMPACTION_FAILED


@dataclass
class ToolBundleEvent(StreamingEvent):
    """Event emitted when a bundle of tools is ready for execution."""

    bundle_id: str
    tools: List[Dict[str, Any]]  # List of prepared tool definitions

    def __post_init__(self):
        self.type = StreamingEventType.TOOL_BUNDLE


@dataclass
class TraceEvent(StreamingEvent):
    """Sanitized runtime trace event emitted for durable diagnostics."""

    path: str
    stage: str
    status: str
    runtime: str
    trace_id: Optional[str] = None
    span_id: Optional[str] = None
    parent_span_id: Optional[str] = None
    request_id: Optional[str] = None
    started_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_ms: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

    def __post_init__(self):
        self.type = StreamingEventType.TRACE_EVENT


@dataclass
class ModelHistoryUpdatedEvent(StreamingEvent):
    """Event emitted when backend model history has a new checkpoint."""

    conversation_ref: str
    revision_id: str
    checkpoint_id: str
    rows: List[Dict[str, Any]]
    created_at: str

    def __post_init__(self):
        self.type = StreamingEventType.MODEL_HISTORY_UPDATED


# Union type for all event types
AgentStreamingEvent = Union[
    ThinkingEvent,
    ChunkEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    ToolCallEvent,
    ToolOutputEvent,
    WebSearchProgressEvent,
    SystemPromptEvent,
    ToolSchemasEvent,
    UserMessageFullEvent,
    AssistantMessageFullEvent,
    FullResponseEvent,
    TokenCountEvent,
    ContextCompactionStartedEvent,
    ContextCompactionCompletedEvent,
    ContextCompactionFailedEvent,
    ToolBundleEvent,
    TraceEvent,
    ModelHistoryUpdatedEvent,
]
