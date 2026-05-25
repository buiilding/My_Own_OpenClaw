import json

import pytest

from backend.src.api.services.transcription.openai_realtime import (
    OPENAI_REALTIME_URL,
    OpenAIRealtimeTranscriptionSession,
)
from backend.src.core.config.models import AppConfig


class _FakeRealtimeConnection:
    def __init__(self) -> None:
        self.sent_messages: list[dict[str, object]] = []
        self.closed = False

    async def send(self, payload: str) -> None:
        self.sent_messages.append(json.loads(payload))

    async def close(self) -> None:
        self.closed = True


class _FakeStreamingConnection(_FakeRealtimeConnection):
    def __init__(self, messages: list[dict[str, object]]) -> None:
        super().__init__()
        self._messages = [json.dumps(message) for message in messages]

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._messages:
            raise StopAsyncIteration
        return self._messages.pop(0)


@pytest.mark.asyncio
async def test_openai_realtime_connect_uses_transcription_intent_and_session_update(
    monkeypatch,
):
    captured: dict[str, object] = {}
    fake_connection = _FakeRealtimeConnection()

    async def _fake_connect(url: str, *, extra_headers):
        captured["url"] = url
        captured["extra_headers"] = extra_headers
        return fake_connection

    monkeypatch.setattr(
        "backend.src.api.services.transcription.openai_realtime.websockets.connect",
        _fake_connect,
    )
    monkeypatch.setattr(
        "backend.src.api.services.transcription.openai_realtime.resolve_openai_api_key",
        lambda _config: "test-openai-key",
    )

    session = OpenAIRealtimeTranscriptionSession(AppConfig(stt_provider="openai"))
    await session.connect()

    assert captured["url"] == f"{OPENAI_REALTIME_URL}?intent=transcription"
    assert captured["extra_headers"] == {
        "Authorization": "Bearer test-openai-key",
    }
    assert fake_connection.sent_messages == [
        {
            "type": "session.update",
            "session": {
                "type": "transcription",
                "audio": {
                    "input": {
                        "format": {
                            "type": "audio/pcm",
                            "rate": 24000,
                        },
                        "transcription": {
                            "model": "gpt-4o-transcribe",
                            "language": "en",
                        },
                        "turn_detection": {
                            "type": "server_vad",
                            "create_response": False,
                            "interrupt_response": False,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 500,
                            "threshold": 0.5,
                        },
                    }
                },
            },
        }
    ]

    await session.close()
    assert fake_connection.closed is True


@pytest.mark.asyncio
async def test_openai_realtime_failed_transcription_clears_partial_transcript():
    session = OpenAIRealtimeTranscriptionSession(AppConfig(stt_provider="openai"))
    session._connection = _FakeStreamingConnection(
        [
            {
                "type": "conversation.item.input_audio_transcription.delta",
                "item_id": "item-1",
                "delta": "hel",
            },
            {
                "type": "conversation.item.input_audio_transcription.failed",
                "item_id": "item-1",
                "error": {"message": "decode failed"},
            },
        ]
    )
    events: list[dict[str, object]] = []

    async def _send_event(event: dict[str, object]) -> None:
        events.append(event)

    await session.stream_events(_send_event)

    assert events == [
        {"type": "realtime", "text": "hel", "is_final": False},
        {"type": "error", "message": "{'message': 'decode failed'}"},
    ]
    assert dict(session._partial_transcripts) == {}
