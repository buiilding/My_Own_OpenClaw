"""Canonical formatter registration specs.

Imports are intentionally lazy to avoid package import cycles through
`backend.src.api.processing.__init__`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TypeAlias

from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.core.types import StreamingEventType

FormatterSpec: TypeAlias = tuple[type, str, type, str]


@lru_cache(maxsize=1)
def get_formatter_specs() -> tuple[FormatterSpec, ...]:
    """Return canonical event->formatter specs for ResponseFormatter."""

    from backend.src.api.processing import formatters as formatter_module
    from backend.src.core.events import (
        AssistantMessageFullEvent,
        ChunkEvent,
        ContextCompactionCompletedEvent,
        ContextCompactionFailedEvent,
        ContextCompactionStartedEvent,
        ErrorEvent,
        MemoryStoreEvent,
        StreamingCompleteEvent,
        SystemPromptEvent,
        ThinkingEvent,
        TokenCountEvent,
        ToolBundleEvent,
        ToolCallEvent,
        ToolOutputEvent,
        ToolSchemasEvent,
        UserMessageFullEvent,
    )

    return (
        (
            ThinkingEvent,
            StreamingEventType.THINKING.value,
            formatter_module.ThinkingEventFormatter,
            OutgoingMessageType.LLM_THOUGHT,
        ),
        (
            ChunkEvent,
            StreamingEventType.CHUNK.value,
            formatter_module.ChunkEventFormatter,
            OutgoingMessageType.STREAMING_RESPONSE,
        ),
        (
            ErrorEvent,
            StreamingEventType.ERROR.value,
            formatter_module.ErrorEventFormatter,
            OutgoingMessageType.ERROR,
        ),
        (
            StreamingCompleteEvent,
            StreamingEventType.STREAMING_COMPLETE.value,
            formatter_module.StreamingCompleteEventFormatter,
            OutgoingMessageType.STREAMING_COMPLETE,
        ),
        (
            ToolCallEvent,
            StreamingEventType.TOOL_CALL.value,
            formatter_module.ToolCallEventFormatter,
            OutgoingMessageType.TOOL_CALL,
        ),
        (
            ToolOutputEvent,
            StreamingEventType.TOOL_OUTPUT.value,
            formatter_module.ToolOutputEventFormatter,
            OutgoingMessageType.TOOL_OUTPUT,
        ),
        (
            SystemPromptEvent,
            StreamingEventType.SYSTEM_PROMPT.value,
            formatter_module.SystemPromptEventFormatter,
            OutgoingMessageType.SYSTEM_PROMPT,
        ),
        (
            ToolSchemasEvent,
            StreamingEventType.TOOL_SCHEMAS.value,
            formatter_module.ToolSchemasEventFormatter,
            OutgoingMessageType.TOOL_SCHEMAS,
        ),
        (
            UserMessageFullEvent,
            StreamingEventType.USER_MESSAGE_FULL.value,
            formatter_module.UserMessageFullEventFormatter,
            OutgoingMessageType.USER_MESSAGE_FULL,
        ),
        (
            AssistantMessageFullEvent,
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
            formatter_module.AssistantMessageFullEventFormatter,
            OutgoingMessageType.ASSISTANT_MESSAGE_FULL,
        ),
        (
            TokenCountEvent,
            StreamingEventType.TOKEN_COUNT.value,
            formatter_module.TokenCountEventFormatter,
            OutgoingMessageType.TOKEN_COUNT,
        ),
        (
            ContextCompactionStartedEvent,
            StreamingEventType.CONTEXT_COMPACTION_STARTED.value,
            formatter_module.ContextCompactionStartedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_STARTED,
        ),
        (
            ContextCompactionCompletedEvent,
            StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value,
            formatter_module.ContextCompactionCompletedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
        ),
        (
            ContextCompactionFailedEvent,
            StreamingEventType.CONTEXT_COMPACTION_FAILED.value,
            formatter_module.ContextCompactionFailedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_FAILED,
        ),
        (
            MemoryStoreEvent,
            StreamingEventType.MEMORY_STORE.value,
            formatter_module.MemoryStoreEventFormatter,
            OutgoingMessageType.MEMORY_STORE,
        ),
        (
            ToolBundleEvent,
            StreamingEventType.TOOL_BUNDLE.value,
            formatter_module.ToolBundleEventFormatter,
            OutgoingMessageType.TOOL_BUNDLE,
        ),
    )
