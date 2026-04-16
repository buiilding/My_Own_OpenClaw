"""
Enumeration types for the application.

This module provides Enum definitions for type safety throughout the codebase.
"""
from enum import Enum
from typing import Final


class MessageRole(str, Enum):
    """Message roles in LLM conversations."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"  # For tool outputs


class MessageType(str, Enum):
    """Types of messages in conversation history."""
    USER_QUERY = "user_query"
    TOOL_OUTPUT = "tool_output"
    ASSISTANT_RESPONSE = "assistant_response"
    CONTEXT_COMPACTION = "context_compaction"


class StreamingEventType(str, Enum):
    """Types of streaming events emitted by the agent."""
    LLM_THOUGHT = "llm-thought"
    THINKING = LLM_THOUGHT
    STREAMING_RESPONSE = "streaming-response"
    CHUNK = STREAMING_RESPONSE
    ERROR = "error"
    STREAMING_COMPLETE = "streaming-complete"
    TOOL_CALL = "tool-call"
    TOOL_OUTPUT = "tool-output"
    SYSTEM_PROMPT = "system-prompt"
    TOOL_SCHEMAS = "tool-schemas"
    USER_MESSAGE_FULL = "user-message-full"
    ASSISTANT_MESSAGE_FULL = "assistant-message-full"
    FULL_RESPONSE = "full_response"
    TOKEN_COUNT = "token-count"
    CONTEXT_COMPACTION_STARTED = "context-compaction-started"
    CONTEXT_COMPACTION_COMPLETED = "context-compaction-completed"
    CONTEXT_COMPACTION_FAILED = "context-compaction-failed"
    CONTENT = "content"  # Used internally by LLM client
    MEMORY_STORE = "memory-store"
    TOOL_BUNDLE = "tool-bundle"
    WEB_SEARCH_PROGRESS = "web-search-progress"


LEGACY_STREAMING_EVENT_TYPE_ALIASES: Final[dict[str, str]] = {
    "thinking": StreamingEventType.LLM_THOUGHT.value,
    "chunk": StreamingEventType.STREAMING_RESPONSE.value,
    "tool_call": StreamingEventType.TOOL_CALL.value,
    "tool_output": StreamingEventType.TOOL_OUTPUT.value,
    "system_prompt": StreamingEventType.SYSTEM_PROMPT.value,
    "tool_schemas": StreamingEventType.TOOL_SCHEMAS.value,
    "user_message_full": StreamingEventType.USER_MESSAGE_FULL.value,
    "assistant_message_full": StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
    "token_count": StreamingEventType.TOKEN_COUNT.value,
    "context_compaction_started": StreamingEventType.CONTEXT_COMPACTION_STARTED.value,
    "context_compaction_completed": StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value,
    "context_compaction_failed": StreamingEventType.CONTEXT_COMPACTION_FAILED.value,
    "web_search_progress": StreamingEventType.WEB_SEARCH_PROGRESS.value,
}


def normalize_streaming_event_type(event_type: str | None) -> str | None:
    """Normalize legacy/internal stream event type spellings to canonical transport names."""
    if not isinstance(event_type, str):
        return None
    normalized = event_type.strip()
    if not normalized:
        return None
    return LEGACY_STREAMING_EVENT_TYPE_ALIASES.get(normalized, normalized)


class ContentType(str, Enum):
    """Types of content in multimodal messages."""
    TEXT = "text"
    IMAGE_URL = "image_url"


class MouseAction(str, Enum):
    """Mouse actions for computer control."""
    CLICK = "click"
    DOUBLE_CLICK = "double_click"
    RIGHT_CLICK = "right_click"
    MOVE = "move"
    DRAG = "drag"


class KeyboardAction(str, Enum):
    """Keyboard actions for computer control."""
    TYPE = "type"
    PASTE = "paste"
    PRESS = "press"
    HOTKEY = "hotkey"


class CoordinateFindingMethod(str, Enum):
    """Methods for finding coordinates in mouse control."""
    MANUAL = "manual"
    OCR = "ocr"
    PREDICTION = "prediction"


class MemoryType(str, Enum):
    """Types of memory storage."""
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
