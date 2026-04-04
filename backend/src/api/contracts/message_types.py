"""Canonical API message type constants.

Keep runtime send/dispatch code on these constants to avoid drift.
Schema `Literal[...]` declarations remain explicit and are validated via tests.
"""

from __future__ import annotations

from typing import Final


class IncomingMessageType:
    """Incoming WebSocket message type names."""

    QUERY: Final[str] = "query"
    STOP_QUERY: Final[str] = "stop-query"
    REHYDRATE_CONVERSATION: Final[str] = "rehydrate-conversation"
    LOAD_SETTINGS: Final[str] = "load-settings"
    LIST_MODELS: Final[str] = "list-models"
    UPDATE_SETTINGS: Final[str] = "update-settings"
    WAKEWORD_DETECTED: Final[str] = "wakeword-detected"
    COMPACT_HISTORY: Final[str] = "compact-history"
    TOOL_RESULT: Final[str] = "tool-result"
    TOOL_BUNDLE_RESULT: Final[str] = "tool-bundle-result"


INCOMING_MESSAGE_TYPES: Final[tuple[str, ...]] = (
    IncomingMessageType.QUERY,
    IncomingMessageType.STOP_QUERY,
    IncomingMessageType.REHYDRATE_CONVERSATION,
    IncomingMessageType.LOAD_SETTINGS,
    IncomingMessageType.LIST_MODELS,
    IncomingMessageType.UPDATE_SETTINGS,
    IncomingMessageType.WAKEWORD_DETECTED,
    IncomingMessageType.COMPACT_HISTORY,
    IncomingMessageType.TOOL_RESULT,
    IncomingMessageType.TOOL_BUNDLE_RESULT,
)


class OutgoingMessageType:
    """Outgoing WebSocket message type names."""

    ERROR: Final[str] = "error"
    STREAMING_RESPONSE: Final[str] = "streaming-response"
    STREAMING_COMPLETE: Final[str] = "streaming-complete"
    LLM_THOUGHT: Final[str] = "llm-thought"
    TOOL_CALL: Final[str] = "tool-call"
    TOOL_BUNDLE: Final[str] = "tool-bundle"
    TOOL_OUTPUT: Final[str] = "tool-output"
    AUDIO_CHUNK: Final[str] = "audio-chunk"
    WAKEWORD_ACTIVATED: Final[str] = "wakeword-activated"
    WAKEWORD_GREETING: Final[str] = "wakeword-greeting"
    SYSTEM_PROMPT: Final[str] = "system-prompt"
    TOOL_SCHEMAS: Final[str] = "tool-schemas"
    TOKEN_COUNT: Final[str] = "token-count"
    MEMORY_STORE: Final[str] = "memory-store"
    USER_MESSAGE_FULL: Final[str] = "user-message-full"
    ASSISTANT_MESSAGE_FULL: Final[str] = "assistant-message-full"
    CONTEXT_COMPACTION_STARTED: Final[str] = "context-compaction-started"
    CONTEXT_COMPACTION_COMPLETED: Final[str] = "context-compaction-completed"
    CONTEXT_COMPACTION_FAILED: Final[str] = "context-compaction-failed"
    SETTINGS_LOADED: Final[str] = "settings-loaded"
    SETTINGS_UPDATED: Final[str] = "settings-updated"
    MODELS_LISTED: Final[str] = "models-listed"


OUTGOING_SCHEMA_MESSAGE_TYPES: Final[tuple[str, ...]] = (
    OutgoingMessageType.ERROR,
    OutgoingMessageType.STREAMING_RESPONSE,
    OutgoingMessageType.STREAMING_COMPLETE,
    OutgoingMessageType.LLM_THOUGHT,
    OutgoingMessageType.TOOL_CALL,
    OutgoingMessageType.TOOL_BUNDLE,
    OutgoingMessageType.TOOL_OUTPUT,
    OutgoingMessageType.AUDIO_CHUNK,
    OutgoingMessageType.WAKEWORD_ACTIVATED,
    OutgoingMessageType.WAKEWORD_GREETING,
    OutgoingMessageType.SYSTEM_PROMPT,
    OutgoingMessageType.TOOL_SCHEMAS,
    OutgoingMessageType.TOKEN_COUNT,
    OutgoingMessageType.MEMORY_STORE,
    OutgoingMessageType.USER_MESSAGE_FULL,
    OutgoingMessageType.ASSISTANT_MESSAGE_FULL,
    OutgoingMessageType.CONTEXT_COMPACTION_STARTED,
    OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
    OutgoingMessageType.CONTEXT_COMPACTION_FAILED,
)
