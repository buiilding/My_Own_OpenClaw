import asyncio
from types import SimpleNamespace

import pytest

import backend.src.api.services.wakeword_execution as wakeword_module
from backend.src.api.contracts.message_types import OutgoingMessageType
from backend.src.api.schema import WakewordDetectedMessage
from backend.src.api.services.wakeword_execution import WakewordExecutionService


class _FakeSpeechService:
    def __init__(self):
        self.calls = []

    async def process_text(self, text):
        self.calls.append(("process_text", text))

    async def flush(self):
        self.calls.append(("flush",))

    async def wait_until_finished(self, timeout):
        self.calls.append(("wait_until_finished", timeout))


def _make_tts_session_class(*, service, wait_error=None, observed=None):
    observed = observed if observed is not None else {}

    class _FakeTTSSession:
        def __init__(self, tts_manager, config, websocket, msg_id):
            observed["init"] = (tts_manager, config, websocket, msg_id)
            self.service = None
            self.wait_calls = []

        async def __aenter__(self):
            self.service = service
            observed["session"] = self
            return self

        async def __aexit__(self, exc_type, exc, tb):
            observed["exit"] = (exc_type, exc, tb)

        async def wait_for_audio_completion(self, timeout):
            self.wait_calls.append(timeout)
            if wait_error is not None:
                raise wait_error

    return _FakeTTSSession


def _build_wakeword_service(greeting="Hello!"):
    return SimpleNamespace(
        config=SimpleNamespace(tts_enabled=True),
        select_greeting=lambda: greeting,
        get_activation_payload=lambda selected: {"greeting": selected, "activated": True},
    )


def _build_message():
    return WakewordDetectedMessage(
        id="wake-1",
        type="wakeword-detected",
        user_id="user-1",
    )


@pytest.mark.asyncio
async def test_execute_sends_activation_and_greeting_and_runs_tts(monkeypatch):
    sent = []
    speech = _FakeSpeechService()
    observed = {}

    async def _fake_send_success_response(websocket, msg_id, response_type, payload, context=None):
        sent.append((websocket, msg_id, response_type, payload, context))

    monkeypatch.setattr(wakeword_module, "send_success_response", _fake_send_success_response)
    monkeypatch.setattr(
        wakeword_module,
        "TTSSession",
        _make_tts_session_class(service=speech, observed=observed),
    )

    websocket = object()
    message = _build_message()
    service = WakewordExecutionService(tts_manager=object(), wakeword_service=_build_wakeword_service("Hi there"))

    await service.execute(message, websocket, user_id="user-1")

    assert [entry[2] for entry in sent] == [
        OutgoingMessageType.WAKEWORD_ACTIVATED,
        OutgoingMessageType.WAKEWORD_GREETING,
    ]
    assert sent[0][3] == {"greeting": "Hi there", "activated": True}
    assert sent[1][3] == {"text": "Hi there"}
    assert speech.calls == [
        ("process_text", "Hi there"),
        ("flush",),
        ("wait_until_finished", 10.0),
    ]
    assert observed["session"].wait_calls == [5.0]


@pytest.mark.asyncio
async def test_execute_skips_tts_when_session_has_no_service(monkeypatch):
    sent = []

    async def _fake_send_success_response(websocket, msg_id, response_type, payload, context=None):
        sent.append((response_type, payload))

    monkeypatch.setattr(wakeword_module, "send_success_response", _fake_send_success_response)
    monkeypatch.setattr(
        wakeword_module,
        "TTSSession",
        _make_tts_session_class(service=None),
    )

    service = WakewordExecutionService(tts_manager=object(), wakeword_service=_build_wakeword_service("Hello"))
    await service.execute(_build_message(), websocket=object(), user_id="user-2")

    assert sent == [
        (OutgoingMessageType.WAKEWORD_ACTIVATED, {"greeting": "Hello", "activated": True}),
        (OutgoingMessageType.WAKEWORD_GREETING, {"text": "Hello"}),
    ]


@pytest.mark.asyncio
async def test_execute_swallows_wait_for_audio_timeout(monkeypatch):
    sent = []
    speech = _FakeSpeechService()

    async def _fake_send_success_response(websocket, msg_id, response_type, payload, context=None):
        sent.append((response_type, payload))

    monkeypatch.setattr(wakeword_module, "send_success_response", _fake_send_success_response)
    monkeypatch.setattr(
        wakeword_module,
        "TTSSession",
        _make_tts_session_class(service=speech, wait_error=asyncio.TimeoutError()),
    )

    service = WakewordExecutionService(tts_manager=object(), wakeword_service=_build_wakeword_service("Yo"))
    await service.execute(_build_message(), websocket=object(), user_id="user-3")

    assert len(sent) == 2
    assert speech.calls == [
        ("process_text", "Yo"),
        ("flush",),
        ("wait_until_finished", 10.0),
    ]


@pytest.mark.asyncio
async def test_execute_swallows_non_timeout_audio_completion_errors(monkeypatch):
    sent = []
    speech = _FakeSpeechService()

    async def _fake_send_success_response(websocket, msg_id, response_type, payload, context=None):
        sent.append((response_type, payload))

    monkeypatch.setattr(wakeword_module, "send_success_response", _fake_send_success_response)
    monkeypatch.setattr(
        wakeword_module,
        "TTSSession",
        _make_tts_session_class(service=speech, wait_error=RuntimeError("stream closed")),
    )

    service = WakewordExecutionService(tts_manager=object(), wakeword_service=_build_wakeword_service("Hello"))
    await service.execute(_build_message(), websocket=object(), user_id="user-4")

    assert len(sent) == 2
    assert sent[1][1] == {"text": "Hello"}
    assert speech.calls == [
        ("process_text", "Hello"),
        ("flush",),
        ("wait_until_finished", 10.0),
    ]


@pytest.mark.asyncio
async def test_execute_uses_selected_greeting_for_activation_payload(monkeypatch):
    sent = []
    captured = {}
    speech = _FakeSpeechService()

    async def _fake_send_success_response(websocket, msg_id, response_type, payload, context=None):
        sent.append((response_type, payload))

    def _build_payload(selected):
        captured["selected"] = selected
        return {"activated": True, "selected": selected}

    wakeword_service = SimpleNamespace(
        config=SimpleNamespace(tts_enabled=True),
        select_greeting=lambda: "Wake up",
        get_activation_payload=_build_payload,
    )

    monkeypatch.setattr(wakeword_module, "send_success_response", _fake_send_success_response)
    monkeypatch.setattr(
        wakeword_module,
        "TTSSession",
        _make_tts_session_class(service=speech),
    )

    service = WakewordExecutionService(tts_manager=object(), wakeword_service=wakeword_service)
    await service.execute(_build_message(), websocket=object(), user_id="user-5")

    assert captured["selected"] == "Wake up"
    assert sent[0] == (
        OutgoingMessageType.WAKEWORD_ACTIVATED,
        {"activated": True, "selected": "Wake up"},
    )
    assert sent[1] == (OutgoingMessageType.WAKEWORD_GREETING, {"text": "Wake up"})
