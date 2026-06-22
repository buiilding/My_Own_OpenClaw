"""Canonical formatter registration specs.

Imports are intentionally lazy to avoid package import cycles through
`backend.src.api.processing.__init__`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TypeAlias

from backend.src.core.types.enums import StreamingEventType

FormatterSpec: TypeAlias = tuple[type, str, type]


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
    from backend.src.api.processing.formatters.model_history_updated import (
        ModelHistoryUpdatedEventFormatter,
    )
    from backend.src.api.processing.formatters.system_prompt import (
        SystemPromptEventFormatter,
    )
    from backend.src.api.processing.formatters.thinking import ThinkingEventFormatter
    from backend.src.api.processing.formatters.token_count import (
        TokenCountEventFormatter,
    )
    from backend.src.api.processing.formatters.tool_bundle import (
        ToolBundleEventFormatter,
    )
    from backend.src.api.processing.formatters.tool_call import ToolCallEventFormatter
    from backend.src.api.processing.formatters.tool_output import (
        ToolOutputEventFormatter,
    )
    from backend.src.api.processing.formatters.tool_schemas import (
        ToolSchemasEventFormatter,
    )
    from backend.src.api.processing.formatters.trace_event import TraceEventFormatter
    from backend.src.api.processing.formatters.user_message import (
        UserMessageFullEventFormatter,
    )
    from backend.src.api.processing.formatters.web_search_progress import (
        WebSearchProgressEventFormatter,
    )
    from backend.src.core.events.streaming_events import (
        AssistantMessageFullEvent,
        ChunkEvent,
        ContextCompactionCompletedEvent,
        ContextCompactionFailedEvent,
        ContextCompactionStartedEvent,
        ErrorEvent,
        ModelHistoryUpdatedEvent,
        StreamingCompleteEvent,
        SystemPromptEvent,
        ThinkingEvent,
        TokenCountEvent,
        ToolBundleEvent,
        ToolCallEvent,
        ToolOutputEvent,
        ToolSchemasEvent,
        TraceEvent,
        UserMessageFullEvent,
        WebSearchProgressEvent,
    )

    return (
        (
            ThinkingEvent,
            StreamingEventType.LLM_THOUGHT.value,
            ThinkingEventFormatter,
        ),
        (
            ChunkEvent,
            StreamingEventType.STREAMING_RESPONSE.value,
            ChunkEventFormatter,
        ),
        (
            ErrorEvent,
            StreamingEventType.ERROR.value,
            ErrorEventFormatter,
        ),
        (
            StreamingCompleteEvent,
            StreamingEventType.STREAMING_COMPLETE.value,
            StreamingCompleteEventFormatter,
        ),
        (
            ToolCallEvent,
            StreamingEventType.TOOL_CALL.value,
            ToolCallEventFormatter,
        ),
        (
            ToolOutputEvent,
            StreamingEventType.TOOL_OUTPUT.value,
            ToolOutputEventFormatter,
        ),
        (
            WebSearchProgressEvent,
            StreamingEventType.WEB_SEARCH_PROGRESS.value,
            WebSearchProgressEventFormatter,
        ),
        (
            SystemPromptEvent,
            StreamingEventType.SYSTEM_PROMPT.value,
            SystemPromptEventFormatter,
        ),
        (
            ToolSchemasEvent,
            StreamingEventType.TOOL_SCHEMAS.value,
            ToolSchemasEventFormatter,
        ),
        (
            UserMessageFullEvent,
            StreamingEventType.USER_MESSAGE_FULL.value,
            UserMessageFullEventFormatter,
        ),
        (
            AssistantMessageFullEvent,
            StreamingEventType.ASSISTANT_MESSAGE_FULL.value,
            AssistantMessageFullEventFormatter,
        ),
        (
            TokenCountEvent,
            StreamingEventType.TOKEN_COUNT.value,
            TokenCountEventFormatter,
        ),
        (
            ContextCompactionStartedEvent,
            StreamingEventType.CONTEXT_COMPACTION_STARTED.value,
            ContextCompactionStartedEventFormatter,
        ),
        (
            ContextCompactionCompletedEvent,
            StreamingEventType.CONTEXT_COMPACTION_COMPLETED.value,
            ContextCompactionCompletedEventFormatter,
        ),
        (
            ContextCompactionFailedEvent,
            StreamingEventType.CONTEXT_COMPACTION_FAILED.value,
            ContextCompactionFailedEventFormatter,
        ),
        (
            ToolBundleEvent,
            StreamingEventType.TOOL_BUNDLE.value,
            ToolBundleEventFormatter,
        ),
        (
            TraceEvent,
            StreamingEventType.TRACE_EVENT.value,
            TraceEventFormatter,
        ),
        (
            ModelHistoryUpdatedEvent,
            StreamingEventType.MODEL_HISTORY_UPDATED.value,
            ModelHistoryUpdatedEventFormatter,
        ),
    )
