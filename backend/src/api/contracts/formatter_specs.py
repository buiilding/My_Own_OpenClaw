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

    from backend.src.api.processing.formatters.assistant_message import (
        AssistantMessageFullEventFormatter,
    )
    from backend.src.api.processing.formatters.chunk import ChunkEventFormatter
    from backend.src.api.processing.formatters.complete import (
        StreamingCompleteEventFormatter,
    )
    from backend.src.api.processing.formatters.context_compaction_completed import (
        ContextCompactionCompletedEventFormatter,
    )
    from backend.src.api.processing.formatters.context_compaction_failed import (
        ContextCompactionFailedEventFormatter,
    )
    from backend.src.api.processing.formatters.context_compaction_started import (
        ContextCompactionStartedEventFormatter,
    )
    from backend.src.api.processing.formatters.error import ErrorEventFormatter
    from backend.src.api.processing.formatters.memory_store import (
        MemoryStoreEventFormatter,
    )
    from backend.src.api.processing.formatters.system_prompt import (
        SystemPromptEventFormatter,
    )
    from backend.src.api.processing.formatters.thinking import ThinkingEventFormatter
    from backend.src.api.processing.formatters.token_count import TokenCountEventFormatter
    from backend.src.api.processing.formatters.tool_bundle import ToolBundleEventFormatter
    from backend.src.api.processing.formatters.tool_call import ToolCallEventFormatter
    from backend.src.api.processing.formatters.tool_output import ToolOutputEventFormatter
    from backend.src.api.processing.formatters.tool_schemas import (
        ToolSchemasEventFormatter,
    )
    from backend.src.api.processing.formatters.user_message import (
        UserMessageFullEventFormatter,
    )
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
            ThinkingEventFormatter,
            OutgoingMessageType.LLM_THOUGHT,
        ),
        (
            ChunkEvent,
            StreamingEventType.CHUNK.value,
            ChunkEventFormatter,
            OutgoingMessageType.STREAMING_RESPONSE,
        ),
        (
            ErrorEvent,
            StreamingEventType.ERROR.value,
            ErrorEventFormatter,
            OutgoingMessageType.ERROR,
        ),
        (
            StreamingCompleteEvent,
            StreamingEventType.STREAMING_COMPLETE.value,
            StreamingCompleteEventFormatter,
            OutgoingMessageType.STREAMING_COMPLETE,
        ),
        (
            ToolCallEvent,
            StreamingEventType.TOOL_CALL.value,
            ToolCallEventFormatter,
            OutgoingMessageType.TOOL_CALL,
        ),
        (
            ToolOutputEvent,
            StreamingEventType.TOOL_OUTPUT.value,
            ToolOutputEventFormatter,
            OutgoingMessageType.TOOL_OUTPUT,
        ),
        (
            SystemPromptEvent,
            StreamingEventType.SYSTEM_PROMPT.value,
            SystemPromptEventFormatter,
            OutgoingMessageType.SYSTEM_PROMPT,
        ),
        (
            ToolSchemasEvent,
            StreamingEventType.TOOL_SCHEMAS.value,
            ToolSchemasEventFormatter,
            OutgoingMessageType.TOOL_SCHEMAS,
        ),
        (
            UserMessageFullEvent,
            StreamingEventType.USER_MESSAGE_FULL.value,
            UserMessageFullEventFormatter,
            OutgoingMessageType.USER_MESSAGE_FULL,
        ),
        (
            AssistantMessageFullEvent,
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
            AssistantMessageFullEventFormatter,
            OutgoingMessageType.ASSISTANT_MESSAGE_FULL,
        ),
        (
            TokenCountEvent,
            StreamingEventType.TOKEN_COUNT.value,
            TokenCountEventFormatter,
            OutgoingMessageType.TOKEN_COUNT,
        ),
        (
            ContextCompactionStartedEvent,
            StreamingEventType.CONTEXT_COMPACTION_STARTED.value,
            ContextCompactionStartedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_STARTED,
        ),
        (
            ContextCompactionCompletedEvent,
            StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value,
            ContextCompactionCompletedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_COMPLETED,
        ),
        (
            ContextCompactionFailedEvent,
            StreamingEventType.CONTEXT_COMPACTION_FAILED.value,
            ContextCompactionFailedEventFormatter,
            OutgoingMessageType.CONTEXT_COMPACTION_FAILED,
        ),
        (
            MemoryStoreEvent,
            StreamingEventType.MEMORY_STORE.value,
            MemoryStoreEventFormatter,
            OutgoingMessageType.MEMORY_STORE,
        ),
        (
            ToolBundleEvent,
            StreamingEventType.TOOL_BUNDLE.value,
            ToolBundleEventFormatter,
            OutgoingMessageType.TOOL_BUNDLE,
        ),
    )
