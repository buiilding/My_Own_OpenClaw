"""
TypedDict schemas for the application.

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


class InputTextContent(TypedDict):
    """Input-text content block used by OpenAI Responses history/items."""

    type: Literal["input_text"]
    text: str


class OutputTextContent(TypedDict):
    """Output-text content block used by OpenAI Responses assistant history/items."""

    type: Literal["output_text"]
    text: str


class RefusalContent(TypedDict):
    """Assistant refusal block used by OpenAI Responses history/items."""

    type: Literal["refusal"]
    refusal: str


class ImageContent(TypedDict):
    """Image content in a multimodal message."""

    type: Literal["image_url"]
    image_url: Dict[str, str]  # {"url": "data:image/..."}


TextLikeContent = Union[
    TextContent,
    InputTextContent,
    OutputTextContent,
    RefusalContent,
]
MultimodalContent = List[Union[TextLikeContent, ImageContent]]


class NormalizedToolCall(TypedDict):
    """Canonical backend representation of a model-emitted tool call."""

    id: str
    name: str
    arguments: Dict[str, Any]
    thought_signature: NotRequired[str]


class SystemLLMMessage(TypedDict):
    """System message for LLM APIs."""

    role: Literal["system"]
    content: Union[str, MultimodalContent]


class UserLLMMessage(TypedDict):
    """User message for LLM APIs."""

    role: Literal["user"]
    content: Union[str, MultimodalContent]


class AssistantLLMMessageBase(TypedDict):
    """Base assistant message shape with required role."""

    role: Literal["assistant"]


class AssistantLLMMessage(AssistantLLMMessageBase, total=False):
    """Assistant message supporting native tool-call metadata."""

    content: Union[str, MultimodalContent]
    tool_calls: List[NormalizedToolCall]
    name: str


class ToolLLMMessage(TypedDict):
    """Tool result message for follow-up turns after tool execution."""

    role: Literal["tool"]
    content: Union[str, MultimodalContent]
    tool_call_id: str
    name: NotRequired[str]


LLMMessage = Union[
    SystemLLMMessage,
    UserLLMMessage,
    AssistantLLMMessage,
    ToolLLMMessage,
]


# --- Normalized Final Response ---


class NormalizedLLMResponse(TypedDict):
    """Canonical provider response shape used by LLM client + runtime."""

    content: str
    tool_calls: NotRequired[List[NormalizedToolCall]]
    finish_reason: NotRequired[Optional[str]]
    response_id: NotRequired[str]
    web_search_sources: NotRequired[List[Dict[str, Any]]]


# ============================================================================
# Tool Schema Types
# ============================================================================


class ToolSchema(TypedDict, total=False):
    """Canonical internal model-facing tool schema."""

    type: str
    name: NotRequired[str]
    description: NotRequired[str]
    strict: NotRequired[bool]
    parameters: NotRequired[Dict[str, Any]]
