"""Canonical formatter registration specs.

Imports are intentionally lazy to avoid package import cycles through
`backend.src.api.processing.__init__`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TypeAlias

from backend.src.core.types import StreamingEventType

FormatterSpec: TypeAlias = tuple[type, str, type]


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
        WebSearchProgressEvent,
    )

    return (
        (
            ThinkingEvent,
            StreamingEventType.LLM_THOUGHT.value,
            formatter_module.ThinkingEventFormatter,
        ),
        (
            ChunkEvent,
            StreamingEventType.STREAMING_RESPONSE.value,
            formatter_module.ChunkEventFormatter,
        ),
        (
            ErrorEvent,
            StreamingEventType.ERROR.value,
            formatter_module.ErrorEventFormatter,
        ),
        (
            StreamingCompleteEvent,
            StreamingEventType.STREAMING_COMPLETE.value,
            formatter_module.StreamingCompleteEventFormatter,
        ),
        (
            ToolCallEvent,
            StreamingEventType.TOOL_CALL.value,
            formatter_module.ToolCallEventFormatter,
        ),
        (
            ToolOutputEvent,
            StreamingEventType.TOOL_OUTPUT.value,
            formatter_module.ToolOutputEventFormatter,
        ),
        (
            WebSearchProgressEvent,
            StreamingEventType.WEB_SEARCH_PROGRESS.value,
            formatter_module.WebSearchProgressEventFormatter,
        ),
        (
            SystemPromptEvent,
            StreamingEventType.SYSTEM_PROMPT.value,
            formatter_module.SystemPromptEventFormatter,
        ),
        (
            ToolSchemasEvent,
            StreamingEventType.TOOL_SCHEMAS.value,
            formatter_module.ToolSchemasEventFormatter,
        ),
        (
            UserMessageFullEvent,
            StreamingEventType.USER_MESSAGE_FULL.value,
            formatter_module.UserMessageFullEventFormatter,
        ),
        (
            AssistantMessageFullEvent,
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
            formatter_module.AssistantMessageFullEventFormatter,
        ),
        (
            TokenCountEvent,
            StreamingEventType.TOKEN_COUNT.value,
            formatter_module.TokenCountEventFormatter,
        ),
        (
            ContextCompactionStartedEvent,
            StreamingEventType.CONTEXT_COMPACTION_STARTED.value,
            formatter_module.ContextCompactionStartedEventFormatter,
        ),
        (
            ContextCompactionCompletedEvent,
            StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value,
            formatter_module.ContextCompactionCompletedEventFormatter,
        ),
        (
            ContextCompactionFailedEvent,
            StreamingEventType.CONTEXT_COMPACTION_FAILED.value,
            formatter_module.ContextCompactionFailedEventFormatter,
        ),
        (
            MemoryStoreEvent,
            StreamingEventType.MEMORY_STORE.value,
            formatter_module.MemoryStoreEventFormatter,
        ),
        (
            ToolBundleEvent,
            StreamingEventType.TOOL_BUNDLE.value,
            formatter_module.ToolBundleEventFormatter,
        ),
    )
