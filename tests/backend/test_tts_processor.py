"""Tests for TTS chunk suppression."""

from __future__ import annotations

import pytest

from backend.src.api.processing.tts.processor import TTSProcessor
from backend.src.core.events.streaming_events import ChunkEvent


class _RecordingTTSManager:
    def __init__(self) -> None:
        self.spoken: list[str] = []

    async def process_event(self, tts_service, event):
        _ = tts_service
        if isinstance(event, ChunkEvent):
            self.spoken.append(event.content)


@pytest.mark.asyncio
async def test_tts_processor_suppresses_mid_chunk_code_fence() -> None:
    manager = _RecordingTTSManager()
    processor = TTSProcessor(manager)
    processor._is_tool_call_context = False

    await processor._process_chunk(
        ChunkEvent(content="hello ```print(secret)``` world"),
        object(),
    )

    assert manager.spoken == ["hello ", " world"]


@pytest.mark.asyncio
async def test_tts_processor_suppresses_mid_chunk_json_and_keeps_surrounding_text() -> None:
    manager = _RecordingTTSManager()
    processor = TTSProcessor(manager)
    processor._is_tool_call_context = False

    await processor._process_chunk(
        ChunkEvent(content='Intro {"secret": true} outro'),
        object(),
    )

    assert manager.spoken == ["Intro ", " outro"]


@pytest.mark.asyncio
async def test_tts_processor_suppresses_initial_json_and_keeps_trailing_text() -> None:
    manager = _RecordingTTSManager()
    processor = TTSProcessor(manager)

    await processor._process_chunk(
        ChunkEvent(content='{"secret": true} outro'),
        object(),
    )

    assert manager.spoken == [" outro"]
