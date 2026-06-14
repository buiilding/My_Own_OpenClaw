"""Covers query execution pipeline events behavior in the backend test suite."""

import pytest

from backend.src.api.services.query_execution_support.query_execution_pipeline_events import (
    emit_completion_events,
    process_pipeline_event,
)
from backend.src.core.events.streaming_events import ChunkEvent, StreamingCompleteEvent


@pytest.mark.asyncio
async def test_process_pipeline_event_forwards_context():
    observed = {}

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed["event"] = event
            observed["tts_service"] = tts_service
            observed["msg_id"] = msg_id
            observed["context"] = context

    event = ChunkEvent(content="hello")
    context = {"turn_ref": "turn-1"}
    await process_pipeline_event(
        pipeline=_Pipeline(),
        event=event,
        tts_service="tts",
        msg_id="turn-1",
        stream_context=context,
    )

    assert observed == {
        "event": event,
        "tts_service": "tts",
        "msg_id": "turn-1",
        "context": context,
    }


@pytest.mark.asyncio
async def test_emit_completion_events_backfills_chunk_and_terminal():
    observed = []

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed.append((event, context))

    context = {"turn_ref": "turn-2"}
    saw_text_chunk = await emit_completion_events(
        pipeline=_Pipeline(),
        tts_service=None,
        msg_id="turn-2",
        stream_context=context,
        completion_text="final",
        saw_text_chunk=False,
    )

    assert saw_text_chunk is True
    assert isinstance(observed[0][0], ChunkEvent)
    assert isinstance(observed[1][0], StreamingCompleteEvent)
    assert observed[0][1] is context
    assert observed[1][1] is context


@pytest.mark.asyncio
async def test_emit_completion_events_skips_backfill_when_completion_text_empty():
    observed = []

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed.append((event, context))

    context = {"turn_ref": "turn-3"}
    saw_text_chunk = await emit_completion_events(
        pipeline=_Pipeline(),
        tts_service=None,
        msg_id="turn-3",
        stream_context=context,
        completion_text="",
        saw_text_chunk=False,
    )

    assert saw_text_chunk is False
    assert len(observed) == 1
    assert isinstance(observed[0][0], StreamingCompleteEvent)
    assert observed[0][0].final_response == ""
    assert observed[0][1] is context
