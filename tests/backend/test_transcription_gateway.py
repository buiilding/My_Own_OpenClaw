"""Covers transcription gateway behavior in the backend test suite."""

import asyncio
import json
from contextlib import asynccontextmanager
import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from backend.src.api.deps import get_session_manager
from backend.src.api.routes.transcription.router import router as transcription_router
from backend.src.api.services.transcription.audio_frames import (
    build_gateway_audio_frame,
    parse_gateway_audio_frame,
    resample_pcm16_mono,
)
from backend.src.core.config.models import AppConfig

transcription_router_module = importlib.import_module(
    "backend.src.api.routes.transcription.router"
)


class DummySessionManager:
    def __init__(self, config: AppConfig | None = None):
        self.config = config or AppConfig()


class FakeProviderSession:
    def __init__(self):
        self.control_messages = []
        self.audio_chunks = []
        self.closed = False
        self._stop = asyncio.Event()

    async def connect(self) -> None:
        return None

    async def handle_control_message(self, message):
        self.control_messages.append(message)

    async def handle_audio_chunk(self, audio_bytes: bytes, sample_rate: int) -> None:
        self.audio_chunks.append((sample_rate, audio_bytes))

    async def stream_events(self, send_event) -> None:
        await send_event({"type": "realtime", "text": "hello", "is_final": False})
        await self._stop.wait()

    async def close(self) -> None:
        self.closed = True
        self._stop.set()


class CompletingProviderSession:
    def __init__(self):
        self.closed = False

    async def connect(self) -> None:
        return None

    async def stream_events(self, _send_event) -> None:
        return None

    async def close(self) -> None:
        self.closed = True


class PendingReceiveWebSocket:
    def __init__(self):
        self.accepted = False
        self.closed = False
        self.sent_events = []
        self.receive_started = asyncio.Event()
        self.receive_cancelled = False
        self.receive_finished = False

    async def accept(self):
        self.accepted = True

    async def send_json(self, payload):
        self.sent_events.append(payload)

    async def receive(self):
        self.receive_started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.receive_cancelled = True
            raise
        finally:
            self.receive_finished = True

    async def close(self):
        self.closed = True


@asynccontextmanager
async def _test_lifespan(_app: FastAPI):
    yield


def _build_test_app() -> FastAPI:
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(transcription_router)
    return app


def test_parse_gateway_audio_frame_round_trips_metadata_and_payload():
    payload = b"\x01\x02\x03\x04"
    frame = build_gateway_audio_frame(payload, 16000)

    sample_rate, decoded_payload = parse_gateway_audio_frame(frame)

    assert sample_rate == 16000
    assert decoded_payload == payload


def test_resample_pcm16_mono_rejects_odd_length_input_before_numpy():
    with pytest.raises(ValueError, match="PCM16 audio byte length must be even"):
        resample_pcm16_mono(b"\x00", 16000, 24000)


def test_transcription_route_forwards_control_and_audio(monkeypatch):
    fake_provider = FakeProviderSession()
    monkeypatch.setattr(
        transcription_router_module,
        "create_transcription_provider_session",
        lambda _config: fake_provider,
    )

    app = _build_test_app()
    app.dependency_overrides[get_session_manager] = lambda: DummySessionManager()

    with TestClient(app) as client:
        with client.websocket_connect("/ws/transcription") as websocket:
            status_event = websocket.receive_json()
            session_trace = websocket.receive_json()
            connect_trace = websocket.receive_json()
            realtime_event = websocket.receive_json()

            websocket.send_text(
                json.dumps({"type": "set_langs", "source_language": "en"})
            )
            websocket.send_bytes(build_gateway_audio_frame(b"\x10\x11", 16000))
            control_trace = websocket.receive_json()
            audio_trace = websocket.receive_json()

            assert status_event["type"] == "status"
            assert isinstance(status_event["client_id"], str)
            assert session_trace["type"] == "trace-event"
            assert session_trace["payload"]["path"] == "voice.transcription"
            assert session_trace["payload"]["stage"] == "session"
            assert session_trace["payload"]["status"] == "started"
            assert connect_trace["payload"]["stage"] == "provider_connect"
            assert connect_trace["payload"]["status"] == "succeeded"
            assert realtime_event == {
                "type": "realtime",
                "text": "hello",
                "is_final": False,
            }
            assert control_trace["payload"]["data"] == {
                "messageType": "set_langs",
                "payloadKeyCount": 2,
            }
            assert audio_trace["payload"]["data"] == {
                "sampleRate": 16000,
                "byteLength": 2,
            }
            assert "hello" not in json.dumps(
                [
                    session_trace,
                    connect_trace,
                    control_trace,
                    audio_trace,
                ]
            )

    assert fake_provider.control_messages == [
        {"type": "set_langs", "source_language": "en"}
    ]
    assert fake_provider.audio_chunks == [(16000, b"\x10\x11")]
    assert fake_provider.closed is True


@pytest.mark.asyncio
async def test_transcription_route_awaits_cancelled_receive_task(monkeypatch):
    fake_provider = CompletingProviderSession()
    fake_websocket = PendingReceiveWebSocket()
    monkeypatch.setattr(
        transcription_router_module,
        "create_transcription_provider_session",
        lambda _config: fake_provider,
    )

    await transcription_router_module.transcription_websocket_endpoint(
        fake_websocket,
        SimpleNamespace(config=AppConfig()),
    )

    assert fake_websocket.accepted is True
    assert fake_websocket.receive_started.is_set()
    assert fake_websocket.receive_cancelled is True
    assert fake_websocket.receive_finished is True
    assert fake_websocket.closed is True
    assert fake_provider.closed is True
