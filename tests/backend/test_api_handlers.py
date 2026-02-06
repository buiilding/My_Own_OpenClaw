import asyncio
from typing import Any, Dict, List, Optional

import pytest

from backend.src.api.handlers.query import QueryMessageHandler
from backend.src.api.handlers.settings import ListModelsHandler, UpdateSettingsHandler
from backend.src.api.handlers.tool_result import ToolResultHandler
from backend.src.api.handlers.wakeword import WakewordHandler
from backend.src.api.schema import (
    ListModelsMessage,
    QueryMessage,
    ToolBundleResultMessage,
    ToolResultMessage,
    UpdateSettingsMessage,
    WakewordDetectedMessage,
)
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.core.config.models import AppConfig


class FakeWebSocket:
    def __init__(self):
        self.sent: List[Dict[str, Any]] = []

    async def send_json(self, data: Any, mode: str = "text") -> None:
        self.sent.append(data)

    async def send_text(self, data: str) -> None:
        return None

    async def close(self, code: int = 1000, reason: Optional[str] = None) -> None:
        return None


class DummyAgent:
    def __init__(self):
        self.cfg = AppConfig()
        self.updated_configs = []
        self.user_id = "user_1"
        self.session_id = "session_1"

    async def process_query(self, _text, image_data=None, message_content=None):
        yield {"type": "chunk", "content": "ok"}

    async def update_config(self, new_cfg):
        self.cfg = new_cfg
        self.updated_configs.append(new_cfg)


class DummySessionManager:
    def __init__(self):
        self.session = DummyAgent()

    async def get_or_create_session(self, user_id: str):
        return self.session

    def get_session(self, user_id: str):
        return getattr(self, "session_instance", None)

    async def update_session_config(self, user_id: str, updates: Dict[str, Any]) -> None:
        await self.session.update_config(AppConfig(**{**self.session.cfg.model_dump(), **updates}))


class DummySession:
    def __init__(self):
        self.tool_calls = []
        self.bundle_calls = []

    async def process_frontend_tool_result(self, **kwargs):
        self.tool_calls.append(kwargs)

    async def process_frontend_tool_bundle_result(self, **kwargs):
        self.bundle_calls.append(kwargs)


class DummyTTSManager:
    async def initialize_if_enabled(self, _cfg):
        return None

    async def start_streaming_task(self, _service, _websocket, _msg_id):
        return asyncio.create_task(asyncio.sleep(0))

    async def cleanup(self, _service, _task):
        return None


class DummyWakewordService:
    def __init__(self):
        self.config = AppConfig()

    def select_greeting(self) -> str:
        return "Hello"

    def get_activation_payload(self, greeting: str) -> Dict[str, Any]:
        return {"greeting": greeting, "voice_mode_enabled": True}


@pytest.mark.asyncio
async def test_query_handler_success(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    handler = QueryMessageHandler(session_manager, DummyTTSManager(), ResponseFormatter())

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            self.processed = []
            self.waited = False

        async def process(self, event, tts_service, msg_id, context=None):
            self.processed.append((event, msg_id, context))

        async def wait_for_pending_tts(self):
            self.waited = True

    monkeypatch.setattr(
        "backend.src.api.handlers.query.StreamPipeline",
        DummyPipeline,
    )

    message = QueryMessage(
        id="msg_1",
        type="query",
        user_id="user_1",
        payload={"text": "hi", "content": "<user_query>hi</user_query>"},
    )

    await handler.handle(message, websocket, "user_1")

    assert any(msg["type"] == "streaming-complete" for msg in websocket.sent)


@pytest.mark.asyncio
async def test_query_handler_invalid_text():
    websocket = FakeWebSocket()
    handler = QueryMessageHandler(DummySessionManager(), DummyTTSManager(), ResponseFormatter())

    message = QueryMessage(
        id="msg_2",
        type="query",
        user_id="user_1",
        payload={"text": "   ", "content": ""},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "error"
    assert "Invalid query" in websocket.sent[0]["payload"]["message"]


@pytest.mark.asyncio
async def test_tool_result_handler_routes_to_session():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = DummySession()
    handler = ToolResultHandler(session_manager)

    message = ToolResultMessage(
        id="msg_4",
        type="tool-result",
        user_id="user_1",
        payload={"request_id": "req_1", "success": True, "data": {"ok": True}},
    )

    await handler.handle(message, websocket, "user_1")
    assert session_manager.session_instance.tool_calls
    assert session_manager.session_instance.tool_calls[0]["request_id"] == "req_1"


@pytest.mark.asyncio
async def test_tool_bundle_result_handler_routes_to_session():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = DummySession()
    handler = ToolResultHandler(session_manager)

    message = ToolBundleResultMessage(
        id="msg_5",
        type="tool-bundle-result",
        user_id="user_1",
        payload={
            "bundle_id": "bundle_1",
            "status": "success",
            "step_results": [{"tool": "read_file", "status": "ok", "output": "done"}],
            "screenshot": None,
            "system_state": None,
            "error": None,
        },
    )

    await handler.handle(message, websocket, "user_1")
    assert session_manager.session_instance.bundle_calls
    assert session_manager.session_instance.bundle_calls[0]["bundle_id"] == "bundle_1"


@pytest.mark.asyncio
async def test_tool_result_handler_missing_session_is_noop():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = None
    handler = ToolResultHandler(session_manager)

    message = ToolResultMessage(
        id="msg_6",
        type="tool-result",
        user_id="user_1",
        payload={"request_id": "req_2", "success": True, "data": {"ok": True}},
    )

    await handler.handle(message, websocket, "user_1")
    assert not websocket.sent


@pytest.mark.asyncio
async def test_list_models_handler_sends_models():
    websocket = FakeWebSocket()

    class DummyModelService:
        async def get_all_models(self):
            return [{"id": "model-1"}]

    handler = ListModelsHandler(DummyModelService())
    message = ListModelsMessage(id="msg_7", type="list-models", user_id="user_1")

    await handler.handle(message, websocket, "user_1")
    assert websocket.sent
    assert websocket.sent[0]["type"] == "models-listed"
    assert websocket.sent[0]["payload"] == [{"id": "model-1"}]


@pytest.mark.asyncio
async def test_update_settings_handler_updates_session():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    handler = UpdateSettingsHandler(session_manager)

    message = UpdateSettingsMessage(
        id="msg_9",
        type="update-settings",
        user_id="user_1",
        payload={"model_provider": "openai", "selected_model_id": "gpt-5.1"},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "settings-updated"
    assert "updated_keys" in websocket.sent[0]["payload"]
    assert session_manager.session.updated_configs


@pytest.mark.asyncio
async def test_update_settings_handler_rejects_invalid_values():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    handler = UpdateSettingsHandler(session_manager)

    message = UpdateSettingsMessage(
        id="msg_10",
        type="update-settings",
        user_id="user_1",
        payload={"model_mode": "bad"},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "error"
    assert "Invalid settings" in websocket.sent[0]["payload"]["message"]


@pytest.mark.asyncio
async def test_wakeword_handler_sends_activation_and_greeting():
    websocket = FakeWebSocket()
    handler = WakewordHandler(DummyTTSManager(), DummyWakewordService())
    message = WakewordDetectedMessage(id="msg_8", type="wakeword-detected", user_id="user_1")

    await handler.handle(message, websocket, "user_1")
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["type"] == "wakeword-activated"
    assert websocket.sent[1]["type"] == "wakeword-greeting"
