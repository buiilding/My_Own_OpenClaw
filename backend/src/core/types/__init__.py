"""
Types package.

Type definitions including enums, TypedDict schemas, and type aliases.
"""
from backend.src.core.types.aliases import JSONDict, StringDict
from backend.src.core.types.enums import (
    ContentType,
    CoordinateFindingMethod,
    KeyboardAction,
    MemoryType,
    MessageRole,
    MessageType,
    MouseAction,
    ScrollDirection,
    StreamingEventType,
)
from backend.src.core.types.schemas import (
    AssistantMessageFullChunk,
    ContentChunk,
    EpisodicMemory,
    ErrorChunk,
    LLMMessage,
    MemoryItem,
    MultimodalContent,
    NormalizedLLMResponse,
    PluginResultDict,
    ProviderConfigDict,
    StreamingChunk,
    SystemPromptChunk,
    TextContent,
    ToolCallChunk,
    ToolParameterSchema,
    ToolResultDict,
    ToolSchema,
    ThinkingChunk,
    UserMessageFullChunk,
    WebSocketMessage,
)

__all__ = [
    # Enums
    "ContentType",
    "CoordinateFindingMethod",
    "KeyboardAction",
    "MemoryType",
    "MessageRole",
    "MessageType",
    "MouseAction",
    "ScrollDirection",
    "StreamingEventType",
    # Schemas
    "AssistantMessageFullChunk",
    "ContentChunk",
    "EpisodicMemory",
    "ErrorChunk",
    "LLMMessage",
    "MemoryItem",
    "MultimodalContent",
    "NormalizedLLMResponse",
    "PluginResultDict",
    "ProviderConfigDict",
    "StreamingChunk",
    "SystemPromptChunk",
    "TextContent",
    "ToolCallChunk",
    "ToolParameterSchema",
    "ToolResultDict",
    "ToolSchema",
    "ThinkingChunk",
    "UserMessageFullChunk",
    "WebSocketMessage",
    # Aliases
    "JSONDict",
    "StringDict",
]
