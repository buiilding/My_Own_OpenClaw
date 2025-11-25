"""
Type definitions and TypedDict structures for the application.

This module provides TypedDict definitions for common dictionary structures
used throughout the codebase, improving type safety and IDE support.
"""

from typing import TypedDict, Literal, Optional, List, Dict, Union, Any
from typing_extensions import NotRequired


# ============================================================================
# Event and Message Types
# ============================================================================

class StreamingChunk(TypedDict):
    """A single chunk from streaming LLM response."""
    type: Literal["chunk", "thinking_chunk", "full_response", "error"]
    content: str


class ToolCallEvent(TypedDict):
    """Event emitted when a tool is called."""
    type: Literal["tool_call"]
    tool_name: str
    parameters: Dict[str, Any]
    raw_call: str


class ToolOutputEvent(TypedDict):
    """Event emitted when a tool execution completes."""
    type: Literal["tool_output"]
    tool_name: str
    success: bool
    execution_time: float
    output: str
    error: Optional[str]
    screenshot: NotRequired[Optional[str]]


class ThinkingEvent(TypedDict):
    """Event emitted during LLM thinking/reasoning."""
    type: Literal["thinking"]
    content: str


class ErrorEvent(TypedDict):
    """Event emitted when an error occurs."""
    type: Literal["error"]
    content: str


class StreamingCompleteEvent(TypedDict):
    """Event emitted when streaming completes."""
    type: Literal["streaming-complete"]


# Union type for all possible streaming events
StreamingEvent = Union[
    StreamingChunk,
    ToolCallEvent,
    ToolOutputEvent,
    ThinkingEvent,
    ErrorEvent,
    StreamingCompleteEvent,
    Dict[str, Any],  # Fallback for other event types
]


# ============================================================================
# LLM Message Types
# ============================================================================

class TextContent(TypedDict):
    """Text content in a multimodal message."""
    type: Literal["text"]
    text: str


class ImageContent(TypedDict):
    """Image content in a multimodal message."""
    type: Literal["image_url"]
    image_url: Dict[str, str]  # {"url": "data:image/..."}


MultimodalContent = List[Union[TextContent, ImageContent]]


class LLMMessage(TypedDict):
    """Standard LLM message format."""
    role: Literal["system", "user", "assistant"]
    content: Union[str, MultimodalContent]


# ============================================================================
# Tool Result Types
# ============================================================================

class ToolResultDict(TypedDict, total=False):
    """Dictionary representation of a tool execution result."""
    success: bool
    error: NotRequired[Optional[str]]
    llm_content: NotRequired[Optional[str]]
    return_display: NotRequired[Optional[str]]
    data: NotRequired[Any]
    metadata: NotRequired[Optional[Dict[str, Any]]]
    episodic_memories: NotRequired[Optional[List[Dict[str, Any]]]]
    semantic_facts: NotRequired[Optional[List[str]]]
    artifacts: NotRequired[Optional[Dict[str, Any]]]


# ============================================================================
# Configuration Types
# ============================================================================

class ProviderConfigDict(TypedDict, total=False):
    """Dictionary representation of LLM provider configuration."""
    model: str
    api_key_env: str
    base_url: NotRequired[Optional[str]]
    timeout: NotRequired[int]


# ============================================================================
# Memory Types
# ============================================================================

class MemoryItem(TypedDict, total=False):
    """Dictionary representation of a memory item."""
    id: str
    text: str
    user_id: str
    metadata: NotRequired[Optional[Dict[str, Any]]]
    embedding: NotRequired[Optional[List[float]]]
    created_at: NotRequired[float]
    updated_at: NotRequired[float]


class EpisodicMemory(TypedDict, total=False):
    """Dictionary representation of an episodic memory."""
    description: str
    context: NotRequired[Optional[str]]
    timestamp: NotRequired[float]
    tool_name: NotRequired[Optional[str]]


# ============================================================================
# API Request/Response Types
# ============================================================================

class WebSocketMessage(TypedDict, total=False):
    """WebSocket message format."""
    type: str
    data: NotRequired[Dict[str, Any]]
    content: NotRequired[str]
    tool_name: NotRequired[str]
    parameters: NotRequired[Dict[str, Any]]


# ============================================================================
# Plugin Types
# ============================================================================

class PluginResultDict(TypedDict, total=False):
    """Dictionary representation of a plugin result."""
    artifacts: NotRequired[Optional[Dict[str, Any]]]
    modified_result: NotRequired[Optional[Any]]


# ============================================================================
# Tool Schema Types
# ============================================================================

class ToolParameterSchema(TypedDict, total=False):
    """JSON schema for a tool parameter."""
    type: str
    description: NotRequired[str]
    enum: NotRequired[List[Any]]
    default: NotRequired[Any]
    required: NotRequired[bool]


class ToolSchema(TypedDict, total=False):
    """JSON schema for a tool."""
    name: str
    description: str
    parameters: Dict[str, ToolParameterSchema]
    required: NotRequired[List[str]]


# ============================================================================
# Type Aliases for Common Patterns
# ============================================================================

# Generic dictionary types (use sparingly, prefer TypedDict)
JSONDict = Dict[str, Any]
StringDict = Dict[str, str]

