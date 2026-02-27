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


class FailingTransportSender(DummyTransportSender):
    def __init__(self, exc: Exception):
        super().__init__()
        self.exc = exc

    async def send(self, payload):
        self.sent.append(payload)
        raise self.exc


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


@pytest.mark.asyncio
async def test_process_skips_tts_task_when_tts_service_missing() -> None:
    formatter = DummyFormatter(response={"type": "streaming-response", "payload": {"text": "hello"}})
    transport = DummyTransportSender()
    tts_processor = DummyTTSProcessor()
    pipeline = StreamPipeline(tts_processor, formatter, transport)

    await pipeline.process(
        event={"type": "streaming-response", "payload": {"text": "hello"}},
        tts_service=None,
        msg_id="msg_3",
    )
    await asyncio.sleep(0)

    assert transport.sent == [{"type": "streaming-response", "payload": {"text": "hello"}}]
    assert tts_processor.calls == []
    assert len(pipeline._pending_tts_tasks) == 0


@pytest.mark.asyncio
async def test_process_transport_failure_raises_and_does_not_schedule_tts():
    formatter = DummyFormatter(response={"type": "streaming-response", "payload": {"text": "hello"}})
    transport = FailingTransportSender(RuntimeError("socket write failed"))
    tts_processor = DummyTTSProcessor()
    pipeline = StreamPipeline(tts_processor, formatter, transport)

    with pytest.raises(RuntimeError, match="socket write failed"):
        await pipeline.process(
            event={"type": "streaming-response", "payload": {"text": "hello"}},
            tts_service=DummyTTSService(),
            msg_id="msg_4",
        )

    assert tts_processor.calls == []
    assert len(pipeline._pending_tts_tasks) == 0


@pytest.mark.asyncio
async def test_wait_for_pending_tts_noop_when_empty() -> None:
    pipeline = StreamPipeline(DummyTTSProcessor(), DummyFormatter(response=None), DummyTransportSender())

    await pipeline.wait_for_pending_tts()

    assert len(pipeline._pending_tts_tasks) == 0


@pytest.mark.asyncio
async def test_process_skips_transport_when_formatter_returns_none() -> None:
    formatter = DummyFormatter(response=None)
    transport = DummyTransportSender()
    tts_processor = DummyTTSProcessor()
    pipeline = StreamPipeline(tts_processor, formatter, transport)

    await pipeline.process(
        event={"type": "llm-thought", "payload": {"text": "hidden"}},
        tts_service=None,
        msg_id="msg_5",
    )
    await asyncio.sleep(0)

    assert transport.sent == []
    assert tts_processor.calls == []


@pytest.mark.asyncio
async def test_process_still_runs_tts_when_formatter_returns_none() -> None:
    formatter = DummyFormatter(response=None)
    transport = DummyTransportSender()
    tts_processor = DummyTTSProcessor()
    pipeline = StreamPipeline(tts_processor, formatter, transport)
    tts_service = DummyTTSService()
    event = {"type": "llm-thought", "payload": {"text": "audio only"}}

    await pipeline.process(
        event=event,
        tts_service=tts_service,
        msg_id="msg_6",
    )
    await asyncio.sleep(0)
    await pipeline.wait_for_pending_tts()

    assert transport.sent == []
    assert tts_processor.calls == [(event, tts_service)]
