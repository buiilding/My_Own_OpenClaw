"""
Type definitions and TypedDict structures for the application.

This module provides TypedDict definitions for common dictionary structures
used throughout the codebase, improving type safety and IDE support.
"""

from typing import Any, Dict, List, Literal, Optional, TypedDict, Union

from typing_extensions import NotRequired

# ============================================================================
# Event and Message Types
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


# --- Normalized Streaming Chunks ---


class ContentChunk(TypedDict):
    """A single chunk from streaming LLM response."""

    type: Literal["content"]
    content: str


class ThinkingChunk(TypedDict):
    """Event emitted during LLM thinking/reasoning."""

    type: Literal["thinking"]
    content: str


class ToolCallChunk(TypedDict):
    """Event emitted when a tool is called."""

    type: Literal["tool_call"]
    tool_name: str
    parameters: Dict
    raw_call: str


class ErrorChunk(TypedDict):
    """Event emitted when an error occurs."""

    type: Literal["error"]
    content: str


class SystemPromptChunk(TypedDict):
    """Event emitted with full system prompt sent to LLM."""

    type: Literal["system_prompt"]
    content: str
    tool_schemas: Optional[Dict[str, Any]]


class UserMessageFullChunk(TypedDict):
    """Event emitted with full user message including injected context."""

    type: Literal["user_message_full"]
    content: str
    metadata: Dict[str, Any]


class AssistantMessageFullChunk(TypedDict):
    """Event emitted with complete assistant response."""

    type: Literal["assistant_message_full"]
    content: str


StreamingChunk = Union[
    ContentChunk,
    ThinkingChunk,
    ToolCallChunk,
    ErrorChunk,
    SystemPromptChunk,
    UserMessageFullChunk,
    AssistantMessageFullChunk,
]

# --- Normalized Final Response ---


class NormalizedLLMResponse(TypedDict):
    """Dictionary representation of a tool execution result."""

    content: str
    # Future additions could include token counts, stop reason, etc.


# --- Deprecated ---

StreamingEvent = Dict[str, any]


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
