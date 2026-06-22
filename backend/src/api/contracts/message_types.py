"""Canonical API message type constants.

Keep runtime send/dispatch code on these constants to avoid drift.
Schema `Literal[...]` declarations remain explicit and are validated via tests.
"""

from __future__ import annotations

from typing import Final

from backend.src.core.types.enums import StreamingEventType


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
    QUERY_ACCEPTED: Final[str] = "query-accepted"
    STREAMING_RESPONSE: Final[str] = StreamingEventType.STREAMING_RESPONSE.value
    STREAMING_COMPLETE: Final[str] = StreamingEventType.STREAMING_COMPLETE.value
    LLM_THOUGHT: Final[str] = StreamingEventType.LLM_THOUGHT.value
    TOOL_CALL: Final[str] = StreamingEventType.TOOL_CALL.value
    TOOL_BUNDLE: Final[str] = StreamingEventType.TOOL_BUNDLE.value
    TOOL_OUTPUT: Final[str] = StreamingEventType.TOOL_OUTPUT.value
    WEB_SEARCH_PROGRESS: Final[str] = StreamingEventType.WEB_SEARCH_PROGRESS.value
    AUDIO_CHUNK: Final[str] = "audio-chunk"
    WAKEWORD_ACTIVATED: Final[str] = "wakeword-activated"
    WAKEWORD_GREETING: Final[str] = "wakeword-greeting"
    SYSTEM_PROMPT: Final[str] = StreamingEventType.SYSTEM_PROMPT.value
    TOOL_SCHEMAS: Final[str] = StreamingEventType.TOOL_SCHEMAS.value
    TOKEN_COUNT: Final[str] = StreamingEventType.TOKEN_COUNT.value
    USER_MESSAGE_FULL: Final[str] = StreamingEventType.USER_MESSAGE_FULL.value
    ASSISTANT_MESSAGE_FULL: Final[str] = StreamingEventType.ASSISTANT_MESSAGE_FULL.value
    CONTEXT_COMPACTION_STARTED: Final[str] = (
        StreamingEventType.CONTEXT_COMPACTION_STARTED.value
    )
    CONTEXT_COMPACTION_COMPLETED: Final[str] = (
        StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value
    )
    CONTEXT_COMPACTION_FAILED: Final[str] = (
        StreamingEventType.CONTEXT_COMPACTION_FAILED.value
    )
    TRACE_EVENT: Final[str] = StreamingEventType.TRACE_EVENT.value
    MODEL_HISTORY_UPDATED: Final[str] = StreamingEventType.MODEL_HISTORY_UPDATED.value
    STOP_QUERY_ACK: Final[str] = "stop-query-ack"
    SETTINGS_LOADED: Final[str] = "settings-loaded"
    SETTINGS_UPDATED: Final[str] = "settings-updated"
    MODELS_LISTED: Final[str] = "models-listed"


OUTGOING_SCHEMA_MESSAGE_TYPES: Final[tuple[str, ...]] = (
    OutgoingMessageType.ERROR,
    OutgoingMessageType.QUERY_ACCEPTED,
    OutgoingMessageType.STREAMING_RESPONSE,
    OutgoingMessageType.STREAMING_COMPLETE,
    OutgoingMessageType.LLM_THOUGHT,
    OutgoingMessageType.TOOL_CALL,
    OutgoingMessageType.TOOL_BUNDLE,
    OutgoingMessageType.TOOL_OUTPUT,
    OutgoingMessageType.WEB_SEARCH_PROGRESS,
    OutgoingMessageType.AUDIO_CHUNK,
    OutgoingMessageType.WAKEWORD_ACTIVATED,
    OutgoingMessageType.WAKEWORD_GREETING,
    OutgoingMessageType.STOP_QUERY_ACK,
    OutgoingMessageType.SETTINGS_LOADED,
    OutgoingMessageType.SETTINGS_UPDATED,
    OutgoingMessageType.MODELS_LISTED,
    OutgoingMessageType.SYSTEM_PROMPT,
    OutgoingMessageType.TOOL_SCHEMAS,
    OutgoingMessageType.TOKEN_COUNT,
    OutgoingMessageType.USER_MESSAGE_FULL,
    OutgoingMessageType.ASSISTANT_MESSAGE_FULL,
    OutgoingMessageType.CONTEXT_COMPACTION_STARTED,
    OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
    OutgoingMessageType.CONTEXT_COMPACTION_FAILED,
    OutgoingMessageType.TRACE_EVENT,
    OutgoingMessageType.MODEL_HISTORY_UPDATED,
)
