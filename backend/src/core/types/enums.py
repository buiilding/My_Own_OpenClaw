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


class StreamingEventType(str, Enum):
    """Types of streaming events emitted by the agent."""
    THINKING = "thinking"
    CHUNK = "chunk"
    ERROR = "error"
    STREAMING_COMPLETE = "streaming-complete"
    TOOL_CALL = "tool_call"
    TOOL_OUTPUT = "tool_output"
    SYSTEM_PROMPT = "system_prompt"
    TOOL_SCHEMAS = "tool_schemas"
    USER_MESSAGE_FULL = "user_message_full"
    ASSISTANT_MESSAGE_FULL = "assistant_message_full"
    FULL_RESPONSE = "full_response"
    TOKEN_COUNT = "token_count"
    CONTENT = "content"  # Used internally by LLM client
    MEMORY_STORE = "memory-store"
    TOOL_BUNDLE = "tool-bundle"


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
    SCROLL = "scroll"


class KeyboardAction(str, Enum):
    """Keyboard actions for computer control."""
    TYPE = "type"
    PRESS = "press"
    HOTKEY = "hotkey"


class CoordinateFindingMethod(str, Enum):
    """Methods for finding coordinates in mouse control."""
    MANUAL = "manual"
    OCR = "ocr"
    PREDICTION = "prediction"


class ScrollDirection(str, Enum):
    """Scroll directions for mouse control."""
    VERTICAL = "vertical"
    HORIZONTAL = "horizontal"


class MemoryType(str, Enum):
    """Types of memory storage."""
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
