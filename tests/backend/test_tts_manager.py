import pytest

from backend.src.api.processing.tts.manager import TTSManager
from backend.src.core.config.models import AppConfig


class _FakeSpeechService:
    def __init__(self, *, running=True):
        self.running = running
        self.initialize_calls = 0

    async def initialize(self):
        self.initialize_calls += 1


@pytest.mark.asyncio
async def test_initialize_if_enabled_uses_default_elevenlabs_provider(monkeypatch):
    created = []

    def _fake_create_speech_service(config):
        service = _FakeSpeechService(running=True)
        created.append((config.speech_provider, service))
        return service

    monkeypatch.setattr(
        "backend.src.api.processing.tts.manager.create_speech_service",
        _fake_create_speech_service,
    )

    manager = TTSManager()
    service = await manager.initialize_if_enabled(AppConfig(speech_mode_enabled=True))

    assert created[0][0] == "elevenlabs"
    assert service is created[0][1]
    assert service.initialize_calls == 1


@pytest.mark.asyncio
async def test_initialize_if_enabled_falls_back_to_local_when_elevenlabs_unavailable(
    monkeypatch,
):
    elevenlabs_service = _FakeSpeechService(running=False)
    local_service = _FakeSpeechService(running=True)

    monkeypatch.setattr(
        "backend.src.api.processing.tts.manager.create_speech_service",
        lambda _config: elevenlabs_service,
    )
    monkeypatch.setattr(
        "backend.src.api.processing.tts.manager.TTSService",
        lambda _config: local_service,
    )

    manager = TTSManager()
    service = await manager.initialize_if_enabled(
        AppConfig(speech_mode_enabled=True, speech_provider="elevenlabs")
    )

    assert elevenlabs_service.initialize_calls == 1
    assert local_service.initialize_calls == 1
    assert service is local_service
