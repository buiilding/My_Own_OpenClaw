"""Stream pipeline event forwarding helpers for query execution."""

from __future__ import annotations

from typing import Any, Optional

from backend.src.api.processing.pipeline import StreamPipeline
from backend.src.core.events.streaming_events import ChunkEvent, StreamingCompleteEvent


async def process_pipeline_event(
    *,
    pipeline: StreamPipeline,
    event: Any,
    tts_service: Any,
    msg_id: str,
    stream_context: dict[str, Optional[str]],
) -> None:
    """Forward one event through pipeline with prebuilt stream context."""
    await pipeline.process(
        event,
        tts_service,
        msg_id,
        context=stream_context,
    )


async def emit_completion_events(
    *,
    pipeline: StreamPipeline,
    tts_service: Any,
    msg_id: str,
    stream_context: dict[str, Optional[str]],
    completion_text: str,
    saw_text_chunk: bool,
) -> bool:
    """
    Emit optional backfill chunk + terminal completion event using shared context.

    Returns:
        Updated saw_text_chunk flag.
    """
    if not saw_text_chunk and completion_text:
        await process_pipeline_event(
            pipeline=pipeline,
            event=ChunkEvent(content=completion_text),
            tts_service=tts_service,
            msg_id=msg_id,
            stream_context=stream_context,
        )
        saw_text_chunk = True

    await process_pipeline_event(
        pipeline=pipeline,
        event=StreamingCompleteEvent(final_response=completion_text),
        tts_service=tts_service,
        msg_id=msg_id,
        stream_context=stream_context,
    )
    return saw_text_chunk
