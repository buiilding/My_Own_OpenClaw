"""
Enumeration types for the application.

This module provides Enum definitions for type safety throughout the codebase.
"""

from enum import Enum


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
    STREAMING_RESPONSE = "streaming-response"
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
    TOOL_BUNDLE = "tool-bundle"
    WEB_SEARCH_PROGRESS = "web-search-progress"
    TRACE_EVENT = "trace-event"
    MODEL_HISTORY_UPDATED = "model-history-updated"


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
