import asyncio
import json
from contextlib import asynccontextmanager
import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.src.api.deps import get_session_manager
from backend.src.api.routes.transcription import router as transcription_router
from backend.src.api.services.transcription.audio_frames import (
    build_gateway_audio_frame,
    parse_gateway_audio_frame,
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
            realtime_event = websocket.receive_json()

            websocket.send_text(json.dumps({"type": "set_langs", "source_language": "en"}))
            websocket.send_bytes(build_gateway_audio_frame(b"\x10\x11", 16000))

            assert status_event["type"] == "status"
            assert isinstance(status_event["client_id"], str)
            assert realtime_event == {
                "type": "realtime",
                "text": "hello",
                "is_final": False,
            }

    assert fake_provider.control_messages == [{"type": "set_langs", "source_language": "en"}]
    assert fake_provider.audio_chunks == [(16000, b"\x10\x11")]
    assert fake_provider.closed is True
