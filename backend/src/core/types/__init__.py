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
    StreamingEventType,
)
from backend.src.core.types.schemas import (
    AssistantMessageFullChunk,
    ContentChunk,
    EpisodicMemory,
    ErrorChunk,
    InputTextContent,
    LLMMessage,
    MemoryItem,
    MultimodalContent,
    NormalizedLLMResponse,
    OutputTextContent,
    PluginResultDict,
    ProviderConfigDict,
    RefusalContent,
    StreamingChunk,
    SystemPromptChunk,
    TextContent,
    TextLikeContent,
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
    "StreamingEventType",
    # Schemas
    "AssistantMessageFullChunk",
    "ContentChunk",
    "EpisodicMemory",
    "ErrorChunk",
    "InputTextContent",
    "LLMMessage",
    "MemoryItem",
    "MultimodalContent",
    "NormalizedLLMResponse",
    "OutputTextContent",
    "PluginResultDict",
    "ProviderConfigDict",
    "RefusalContent",
    "StreamingChunk",
    "SystemPromptChunk",
    "TextContent",
    "TextLikeContent",
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
