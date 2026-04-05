import asyncio
import json

import pytest

from backend.src.core.config.models import AppConfig
from backend.src.core.services.elevenlabs_tts_service import ElevenLabsTTSService


class _FakeWebSocket:
    def __init__(self):
        self.sent_messages = []
        self._incoming = asyncio.Queue()
        self.closed = False

    async def send(self, payload: str) -> None:
        message = json.loads(payload)
        self.sent_messages.append(message)
        text = message.get("text")
        if isinstance(text, str) and text.strip():
            await self._incoming.put(
                json.dumps(
                    {
                        "audio": "YmFzZTY0LWF1ZGlv",
                        "isFinal": False,
                    }
                )
            )
        if text == "":
            await self._incoming.put(json.dumps({"audio": None, "isFinal": True}))

    async def close(self) -> None:
        self.closed = True

    def __aiter__(self):
        return self

    async def __anext__(self):
        payload = await self._incoming.get()
        if payload is None:
            raise StopAsyncIteration
        return payload


class _FakeWebsocketsModule:
    def __init__(self, websocket):
        self.websocket = websocket
        self.connected_uris = []

    async def connect(self, uri):
        self.connected_uris.append(uri)
        return self.websocket


@pytest.mark.asyncio
async def test_elevenlabs_tts_service_streams_incremental_text_chunks_and_flush(monkeypatch):
    fake_websocket = _FakeWebSocket()
    fake_module = _FakeWebsocketsModule(fake_websocket)
    monkeypatch.setattr(
        "backend.src.core.services.elevenlabs_tts_service._import_websockets",
        lambda: fake_module,
    )
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-elevenlabs-key")

    service = ElevenLabsTTSService(AppConfig(speech_provider="elevenlabs"))
    await service.initialize()

    await service.process_text("Hello")
    await service.process_text(" world.")
    await service.process_text(" trailing")
    audio_iterator = service.stream_audio()
    first_chunk = await audio_iterator.__anext__()

    assert first_chunk == {
        "audio": "YmFzZTY0LWF1ZGlv",
        "sample_rate": 16000,
        "sample_width": 2,
        "channels": 1,
    }
    assert (
        fake_module.connected_uris[0]
        == "wss://api.elevenlabs.io/v1/text-to-speech/"
        "EXAVITQu4vr4xnSDxMaL/stream-input"
        "?model_id=eleven_flash_v2_5&output_format=pcm_16000"
        "&auto_mode=true&inactivity_timeout=60"
    )
    assert fake_websocket.sent_messages[0]["text"] == " "
    assert fake_websocket.sent_messages[1]["text"] == "Hello "
    assert "try_trigger_generation" not in fake_websocket.sent_messages[1]
    assert fake_websocket.sent_messages[2]["text"] == "world. "
    assert fake_websocket.sent_messages[3]["text"] == "trailing "

    await service.flush()
    assert fake_websocket.sent_messages[4]["text"] == ""
    assert fake_websocket.sent_messages[4]["flush"] is True
    assert await service.wait_until_finished(timeout=0.1) is True

    assert await audio_iterator.__anext__() == first_chunk
    assert await audio_iterator.__anext__() == first_chunk
    with pytest.raises(StopAsyncIteration):
        await audio_iterator.__anext__()


@pytest.mark.asyncio
async def test_elevenlabs_tts_service_skips_initialize_without_api_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)

    service = ElevenLabsTTSService(AppConfig(speech_provider="elevenlabs"))
    await service.initialize()

    assert service.running is False


@pytest.mark.asyncio
async def test_elevenlabs_tts_service_keeps_manual_generation_controls_when_auto_mode_disabled(
    monkeypatch,
):
    fake_websocket = _FakeWebSocket()
    fake_module = _FakeWebsocketsModule(fake_websocket)
    monkeypatch.setattr(
        "backend.src.core.services.elevenlabs_tts_service._import_websockets",
        lambda: fake_module,
    )
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-elevenlabs-key")

    service = ElevenLabsTTSService(
        AppConfig(
            speech_provider="elevenlabs",
            elevenlabs_auto_mode=False,
            elevenlabs_inactivity_timeout=120,
        )
    )
    await service.initialize()
    await service.process_text("Hello")

    assert (
        fake_module.connected_uris[0]
        == "wss://api.elevenlabs.io/v1/text-to-speech/"
        "EXAVITQu4vr4xnSDxMaL/stream-input"
        "?model_id=eleven_flash_v2_5&output_format=pcm_16000"
        "&auto_mode=false&inactivity_timeout=120"
    )
    assert fake_websocket.sent_messages[0]["generation_config"] == {
        "chunk_length_schedule": [50, 80, 120, 160]
    }
    assert fake_websocket.sent_messages[1]["try_trigger_generation"] is True
