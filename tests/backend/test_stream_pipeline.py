import asyncio

import pytest

from backend.src.api.processing.pipeline import StreamPipeline


class DummyFormatter:
    def __init__(self, response=None):
        self.response = response
        self.calls = []

    def format(self, event, msg_id, context=None):
        self.calls.append((event, msg_id, context))
        return self.response


class DummyTransportSender:
    def __init__(self):
        self.sent = []

    async def send(self, payload):
        self.sent.append(payload)


class DummyTTSProcessor:
    def __init__(self, gate: asyncio.Event | None = None, error: Exception | None = None):
        self.gate = gate
        self.error = error
        self.calls = []

    async def process_event(self, event, tts_service):
        self.calls.append((event, tts_service))
        if self.gate is not None:
            await self.gate.wait()
        if self.error is not None:
            raise self.error


class DummyTTSService:
    pass


@pytest.mark.asyncio
async def test_process_schedules_tts_in_background_and_tracks_pending_tasks():
    formatter = DummyFormatter(response={"type": "streaming-response", "payload": {"text": "hello"}})
    transport = DummyTransportSender()
    gate = asyncio.Event()
    tts_processor = DummyTTSProcessor(gate=gate)
    pipeline = StreamPipeline(tts_processor, formatter, transport)
    tts_service = DummyTTSService()

    await pipeline.process(
        event={"type": "streaming-response", "payload": {"text": "hello"}},
        tts_service=tts_service,
        msg_id="msg_1",
        context={"conversation_ref": "conv_1"},
    )
    await asyncio.sleep(0)

    # Transport response should be sent immediately, without waiting for TTS.
    assert transport.sent == [{"type": "streaming-response", "payload": {"text": "hello"}}]
    assert len(tts_processor.calls) == 1
    assert len(pipeline._pending_tts_tasks) == 1

    gate.set()
    await pipeline.wait_for_pending_tts()
    assert len(pipeline._pending_tts_tasks) == 0


@pytest.mark.asyncio
async def test_process_swallows_tts_failures_and_cleans_pending_tasks(caplog):
    formatter = DummyFormatter(response={"type": "streaming-response", "payload": {"text": "hello"}})
    transport = DummyTransportSender()
    tts_processor = DummyTTSProcessor(error=RuntimeError("tts failed"))
    pipeline = StreamPipeline(tts_processor, formatter, transport)

    await pipeline.process(
        event={"type": "streaming-response", "payload": {"text": "hello"}},
        tts_service=DummyTTSService(),
        msg_id="msg_2",
    )
    await asyncio.sleep(0)

    # wait_for_pending_tts should not raise even if TTS task failed internally.
    await pipeline.wait_for_pending_tts()
    assert len(pipeline._pending_tts_tasks) == 0
    assert "TTS processing failed, continuing stream" in caplog.text
