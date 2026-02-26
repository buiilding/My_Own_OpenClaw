import pytest

from backend.src.api.services.tts_session import TTSSession
from backend.src.core.config.models import AppConfig


class _DummyTask:
    def __init__(self, *, done: bool = False):
        self._done = done
        self.canceled = False

    def done(self):
        return self._done

    def cancel(self):
        self.canceled = True
        self._done = True


class _FakeTTSManager:
    def __init__(self, *, service=None, audio_task=None):
        self._service = service
        self._audio_task = audio_task
        self.initialize_calls = []
        self.start_calls = []
        self.cleanup_calls = []

    async def initialize_if_enabled(self, config):
        self.initialize_calls.append(config)
        return self._service

    async def start_streaming_task(self, service, websocket, msg_id):
        self.start_calls.append((service, websocket, msg_id))
        return self._audio_task

    async def cleanup(self, service, audio_task):
        self.cleanup_calls.append((service, audio_task))


@pytest.mark.asyncio
async def test_tts_session_enters_and_starts_streaming_when_service_available():
    service = object()
    audio_task = _DummyTask(done=False)
    manager = _FakeTTSManager(service=service, audio_task=audio_task)
    config = AppConfig()
    websocket = object()

    session = TTSSession(manager, config, websocket, "msg-1")
    entered = await session.__aenter__()

    assert entered is session
    assert session.service is service
    assert session.audio_task is audio_task
    assert manager.initialize_calls == [config]
    assert manager.start_calls == [(service, websocket, "msg-1")]


@pytest.mark.asyncio
async def test_tts_session_enter_skips_streaming_when_service_unavailable():
    manager = _FakeTTSManager(service=None, audio_task=None)
    session = TTSSession(manager, AppConfig(), object(), "msg-2")

    await session.__aenter__()

    assert session.service is None
    assert session.audio_task is None
    assert manager.start_calls == []


@pytest.mark.asyncio
async def test_tts_session_exit_cancels_active_task_and_cleans_up():
    service = object()
    audio_task = _DummyTask(done=False)
    manager = _FakeTTSManager(service=service, audio_task=audio_task)
    session = TTSSession(manager, AppConfig(), object(), "msg-3")
    session.service = service
    session.audio_task = audio_task

    await session.__aexit__(None, None, None)

    assert audio_task.canceled is True
    assert manager.cleanup_calls == [(service, audio_task)]


@pytest.mark.asyncio
async def test_tts_session_exit_does_not_cancel_completed_task():
    service = object()
    audio_task = _DummyTask(done=True)
    manager = _FakeTTSManager(service=service, audio_task=audio_task)
    session = TTSSession(manager, AppConfig(), object(), "msg-3b")
    session.service = service
    session.audio_task = audio_task

    await session.__aexit__(None, None, None)

    assert audio_task.canceled is False
    assert manager.cleanup_calls == [(service, audio_task)]


@pytest.mark.asyncio
async def test_tts_session_exit_cleans_up_when_no_audio_task():
    service = object()
    manager = _FakeTTSManager(service=service, audio_task=None)
    session = TTSSession(manager, AppConfig(), object(), "msg-3c")
    session.service = service
    session.audio_task = None

    await session.__aexit__(None, None, None)

    assert manager.cleanup_calls == [(service, None)]


@pytest.mark.asyncio
async def test_wait_for_audio_completion_noops_when_task_missing_or_done(monkeypatch):
    session = TTSSession(_FakeTTSManager(), AppConfig(), object(), "msg-4")
    called = []

    async def _fake_wait_for(task, timeout):  # noqa: ARG001
        called.append("wait")

    monkeypatch.setattr("backend.src.api.services.tts_session.asyncio.wait_for", _fake_wait_for)

    await session.wait_for_audio_completion(timeout=0.1)
    session.audio_task = _DummyTask(done=True)
    await session.wait_for_audio_completion(timeout=0.1)

    assert called == []


@pytest.mark.asyncio
async def test_wait_for_audio_completion_awaits_active_task(monkeypatch):
    session = TTSSession(_FakeTTSManager(), AppConfig(), object(), "msg-5")
    active_task = _DummyTask(done=False)
    session.audio_task = active_task
    observed = {}

    async def _fake_wait_for(task, timeout):
        observed["task"] = task
        observed["timeout"] = timeout
        return None

    monkeypatch.setattr("backend.src.api.services.tts_session.asyncio.wait_for", _fake_wait_for)

    await session.wait_for_audio_completion(timeout=2.5)

    assert observed == {"task": active_task, "timeout": 2.5}
