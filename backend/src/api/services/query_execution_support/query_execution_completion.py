"""Completion helpers for query-stream terminal handling."""

from __future__ import annotations

from typing import Any, Optional

from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.api.services.query_event_extraction import resolve_completion_text
from backend.src.api.services.query_execution_support.query_execution_pipeline_events import (
    emit_completion_events,
)
from backend.src.api.services.query_execution_support.query_execution_stream_state import (
    QueryExecutionStreamState,
)


def resolve_query_completion_text(
    *,
    stream_state: QueryExecutionStreamState,
    event: Any,
    event_type: Optional[str],
    empty_fallback: str,
) -> str:
    """Resolve completion text from the current stream state plus optional terminal event."""
    return resolve_completion_text(
        **stream_state.completion_kwargs(
            event=event,
            event_type=event_type,
        ),
        empty_fallback=empty_fallback,
    )


async def complete_query_stream(
    *,
    pipeline: StreamPipeline,
    tts_service: Any,
    msg_id: str,
    stream_context: dict[str, Any],
    stream_state: QueryExecutionStreamState,
    event: Any,
    event_type: Optional[str],
    empty_fallback: str,
) -> bool:
    """Emit the final backfill/completion sequence and return the updated chunk-seen flag."""
    stream_state.mark_terminal()
    completion_text = resolve_query_completion_text(
        stream_state=stream_state,
        event=event,
        event_type=event_type,
        empty_fallback=empty_fallback,
    )
    return await emit_completion_events(
        pipeline=pipeline,
        tts_service=tts_service,
        msg_id=msg_id,
        stream_context=stream_context,
        completion_text=completion_text,
        saw_text_chunk=stream_state.saw_text_chunk,
    )
