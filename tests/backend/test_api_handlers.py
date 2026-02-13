import asyncio
from typing import Any, Dict, List, Optional

import pytest

from backend.src.api.handlers.query import QueryMessageHandler
from backend.src.api.handlers.rehydrate import RehydrateConversationHandler
from backend.src.api.handlers.settings import (
    ListModelsHandler,
    LoadSettingsHandler,
    UpdateSettingsHandler,
)
from backend.src.api.handlers.tool_result import ToolResultHandler
from backend.src.api.handlers.wakeword import WakewordHandler
from backend.src.api.handlers import query as query_handler_module
from backend.src.api.services import rehydrate_execution as rehydrate_execution_module
from backend.src.api.schemas.incoming import ToolResultData, ToolResultSystemState
from backend.src.api.schema import (
    ListModelsMessage,
    LoadSettingsMessage,
    QueryMessage,
    RehydrateConversationMessage,
    ToolBundleResultMessage,
    ToolResultMessage,
    UpdateSettingsMessage,
    WakewordDetectedMessage,
)
from backend.src.api.processing.formatter import ResponseFormatter
from backend.src.core.config.models import AppConfig
from backend.src.core.events.streaming_events import ChunkEvent, StreamingCompleteEvent


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
        self.rehydrate_calls = []

    async def process_query(
        self,
        _text,
        image_data=None,
        message_content=None,
        conversation_ref=None,
    ):
        yield {"type": "chunk", "content": "ok"}

    async def update_config(self, new_cfg):
        self.cfg = new_cfg
        self.updated_configs.append(new_cfg)

    async def rehydrate_conversation(self, conversation_ref, entries):
        self.rehydrate_calls.append(
            {"conversation_ref": conversation_ref, "entries": entries}
        )


class DummyCaptureAgent:
    def __init__(self):
        self.cfg = AppConfig()
        self.user_id = "user_1"
        self.session_id = "session_1"
        self.calls = []

    async def process_query(
        self,
        text,
        image_data=None,
        message_content=None,
        conversation_ref=None,
    ):
        self.calls.append(
            {
                "text": text,
                "image_data": image_data,
                "message_content": message_content,
                "conversation_ref": conversation_ref,
            }
        )
        yield {"type": "chunk", "content": "ok"}


class DummySilentAgent:
    def __init__(self):
        self.cfg = AppConfig()
        self.user_id = "user_1"
        self.session_id = "session_1"

    async def process_query(
        self,
        text,
        image_data=None,
        message_content=None,
        conversation_ref=None,
    ):
        if False:
            yield {
                "type": "chunk",
                "content": text,
                "image_data": image_data,
                "message_content": message_content,
                "conversation_ref": conversation_ref,
            }


class DummyAssistantFullThenCompleteAgent:
    def __init__(self):
        self.cfg = AppConfig()
        self.user_id = "user_1"
        self.session_id = "session_1"

    async def process_query(
        self,
        text,
        image_data=None,
        message_content=None,
        conversation_ref=None,
    ):
        yield {"type": "assistant_message_full", "content": "Final answer from assistant full"}
        yield {"type": "streaming-complete", "payload": {}}


class DummySessionManager:
    def __init__(self):
        self.session = DummyAgent()

    async def get_or_create_session(self, user_id: str):
        return self.session

    def get_session(self, user_id: str):
        return getattr(self, "session_instance", None)

    async def update_session_config(
        self, user_id: str, updates: Dict[str, Any]
    ) -> None:
        await self.session.update_config(
            AppConfig(**{**self.session.cfg.model_dump(), **updates})
        )


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
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )
    created_pipelines = []

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            self.processed = []
            self.waited = False
            created_pipelines.append(self)

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
        payload={
            "text": "hi",
            "conversation_ref": "conv_test",
            "content": "<user_query>hi</user_query>",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(created_pipelines) == 1
    assert len(created_pipelines[0].processed) == 2
    first_event, first_msg_id, first_context = created_pipelines[0].processed[0]
    second_event, second_msg_id, second_context = created_pipelines[0].processed[1]
    assert first_event == {"type": "chunk", "content": "ok"}
    assert isinstance(second_event, StreamingCompleteEvent)
    assert first_msg_id == second_msg_id == "msg_1"
    assert first_context == second_context == {
        "user_id": "user_1",
        "session_id": "session_1",
        "conversation_ref": "conv_test",
        "turn_ref": "msg_1",
    }
    assert second_event.final_response == "ok"


@pytest.mark.asyncio
async def test_query_handler_emits_fallback_chunk_and_completion_when_agent_stream_is_silent(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session = DummySilentAgent()
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )
    created_pipelines = []

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            self.processed = []
            created_pipelines.append(self)

        async def process(self, event, tts_service, msg_id, context=None):
            self.processed.append((event, msg_id, context))

        async def wait_for_pending_tts(self):
            return None

    monkeypatch.setattr(
        "backend.src.api.handlers.query.StreamPipeline",
        DummyPipeline,
    )

    message = QueryMessage(
        id="msg_silent_1",
        type="query",
        user_id="user_1",
        payload={
            "text": "hi",
            "conversation_ref": "conv_test",
            "content": "<user_query>hi</user_query>",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(created_pipelines) == 1
    assert len(created_pipelines[0].processed) == 2
    first_event, first_msg_id, first_context = created_pipelines[0].processed[0]
    second_event, second_msg_id, second_context = created_pipelines[0].processed[1]
    assert isinstance(first_event, ChunkEvent)
    assert isinstance(second_event, StreamingCompleteEvent)
    assert "empty final response" in first_event.content
    assert first_msg_id == second_msg_id == "msg_silent_1"
    assert first_context == second_context == {
        "user_id": "user_1",
        "session_id": "session_1",
        "conversation_ref": "conv_test",
        "turn_ref": "msg_silent_1",
    }
    assert second_event.final_response == first_event.content


@pytest.mark.asyncio
async def test_query_handler_backfills_chunk_from_assistant_full_before_completion(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session = DummyAssistantFullThenCompleteAgent()
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )
    created_pipelines = []

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            self.processed = []
            created_pipelines.append(self)

        async def process(self, event, tts_service, msg_id, context=None):
            self.processed.append((event, msg_id, context))

        async def wait_for_pending_tts(self):
            return None

    monkeypatch.setattr(
        "backend.src.api.handlers.query.StreamPipeline",
        DummyPipeline,
    )

    message = QueryMessage(
        id="msg_assistant_full_1",
        type="query",
        user_id="user_1",
        payload={
            "text": "hi",
            "conversation_ref": "conv_test",
            "content": "<user_query>hi</user_query>",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(created_pipelines) == 1
    assert len(created_pipelines[0].processed) == 3
    first_event, *_ = created_pipelines[0].processed[0]
    second_event, *_ = created_pipelines[0].processed[1]
    third_event, *_ = created_pipelines[0].processed[2]

    assert first_event == {"type": "assistant_message_full", "content": "Final answer from assistant full"}
    assert isinstance(second_event, ChunkEvent)
    assert second_event.content == "Final answer from assistant full"
    assert isinstance(third_event, StreamingCompleteEvent)
    assert third_event.final_response == "Final answer from assistant full"


@pytest.mark.asyncio
async def test_query_handler_invalid_text():
    websocket = FakeWebSocket()
    handler = QueryMessageHandler(
        DummySessionManager(), DummyTTSManager(), ResponseFormatter()
    )

    message = QueryMessage(
        id="msg_2",
        type="query",
        user_id="user_1",
        payload={"text": "   ", "conversation_ref": "conv_test", "content": ""},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "error"
    assert "Invalid query" in websocket.sent[0]["payload"]["message"]


@pytest.mark.asyncio
async def test_query_handler_loads_screenshot_from_artifact_ref(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session = DummyCaptureAgent()
    session_manager.config = AppConfig()
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            return None

        async def process(self, *_args, **_kwargs):
            return None

        async def wait_for_pending_tts(self):
            return None

    class DummyStore:
        def load_base64(self, artifact_id: str) -> str:
            assert artifact_id == "shot_1.png"
            return "artifact-base64"

    monkeypatch.setattr("backend.src.api.handlers.query.StreamPipeline", DummyPipeline)
    monkeypatch.setattr(
        query_handler_module.ArtifactStore,
        "from_config",
        classmethod(lambda _cls, _cfg: DummyStore()),
    )

    message = QueryMessage(
        id="msg_artifact_ref_1",
        type="query",
        user_id="user_1",
        payload={
            "text": "use artifact screenshot",
            "conversation_ref": "conv_test",
            "content": "<user_query>use artifact screenshot</user_query>",
            "screenshot_ref": "shot_1.png",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(session_manager.session.calls) == 1
    assert session_manager.session.calls[0]["image_data"] == "artifact-base64"
    assert session_manager.session.calls[0]["conversation_ref"] == "conv_test"


@pytest.mark.asyncio
async def test_query_handler_continues_when_artifact_load_fails(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session = DummyCaptureAgent()
    session_manager.config = AppConfig()
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            return None

        async def process(self, *_args, **_kwargs):
            return None

        async def wait_for_pending_tts(self):
            return None

    class DummyStore:
        def load_base64(self, artifact_id: str) -> str:
            raise RuntimeError(f"failed to load {artifact_id}")

    monkeypatch.setattr("backend.src.api.handlers.query.StreamPipeline", DummyPipeline)
    monkeypatch.setattr(
        query_handler_module.ArtifactStore,
        "from_config",
        classmethod(lambda _cls, _cfg: DummyStore()),
    )

    message = QueryMessage(
        id="msg_artifact_ref_2",
        type="query",
        user_id="user_1",
        payload={
            "text": "continue despite artifact error",
            "conversation_ref": "conv_test",
            "content": "<user_query>continue despite artifact error</user_query>",
            "screenshot_ref": "missing.png",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(session_manager.session.calls) == 1
    assert session_manager.session.calls[0]["image_data"] is None


@pytest.mark.asyncio
async def test_query_handler_prefers_inline_screenshot_over_artifact_ref(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session = DummyCaptureAgent()
    session_manager.config = AppConfig()
    handler = QueryMessageHandler(
        session_manager, DummyTTSManager(), ResponseFormatter()
    )

    class DummyPipeline:
        def __init__(self, *_args, **_kwargs):
            return None

        async def process(self, *_args, **_kwargs):
            return None

        async def wait_for_pending_tts(self):
            return None

    monkeypatch.setattr("backend.src.api.handlers.query.StreamPipeline", DummyPipeline)
    monkeypatch.setattr(
        query_handler_module.ArtifactStore,
        "from_config",
        classmethod(
            lambda _cls, _cfg: (_ for _ in ()).throw(
                RuntimeError("should not be called")
            )
        ),
    )

    message = QueryMessage(
        id="msg_artifact_ref_3",
        type="query",
        user_id="user_1",
        payload={
            "text": "inline screenshot should win",
            "conversation_ref": "conv_test",
            "content": "<user_query>inline screenshot should win</user_query>",
            "screenshot": "inline-base64",
            "screenshot_ref": "unused.png",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert len(session_manager.session.calls) == 1
    assert session_manager.session.calls[0]["image_data"] == "inline-base64"


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
        payload={
            "request_id": "req_1",
            "success": True,
            "data": {
                "llm_content": "ok",
                "system_state": {
                    "active_window": "Terminal",
                    "mouse_position": "(845, 512)",
                },
                "output": "ok",
            },
        },
    )

    await handler.handle(message, websocket, "user_1")
    assert session_manager.session_instance.tool_calls
    routed_call = session_manager.session_instance.tool_calls[0]
    assert routed_call["request_id"] == "req_1"
    assert routed_call["result_data"]["system_state"]["active_window"] == "Terminal"
    assert routed_call["result_data"]["system_state"]["mouse_position"] == "(845, 512)"
    assert "metadata" not in routed_call


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
    assert isinstance(
        session_manager.session_instance.bundle_calls[0]["step_results"][0], dict
    )


@pytest.mark.asyncio
async def test_tool_bundle_result_handler_forwards_screenshot_ref():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = DummySession()
    handler = ToolResultHandler(session_manager)

    message = ToolBundleResultMessage(
        id="msg_5b",
        type="tool-bundle-result",
        user_id="user_1",
        payload={
            "bundle_id": "bundle_2",
            "status": "success",
            "step_results": [{"tool": "read_file", "status": "ok", "output": "done"}],
            "screenshot": None,
            "screenshot_ref": "artifact-1.png",
            "system_state": None,
            "error": None,
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert session_manager.session_instance.bundle_calls
    assert session_manager.session_instance.bundle_calls[0]["bundle_id"] == "bundle_2"
    assert (
        session_manager.session_instance.bundle_calls[0]["screenshot_ref"]
        == "artifact-1.png"
    )


@pytest.mark.asyncio
async def test_tool_bundle_result_handler_preserves_step_output_content():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = DummySession()
    handler = ToolResultHandler(session_manager)

    message = ToolBundleResultMessage(
        id="msg_5c",
        type="tool-bundle-result",
        user_id="user_1",
        payload={
            "bundle_id": "bundle_3",
            "status": "success",
            "step_results": [
                {
                    "tool": "run_shell_command",
                    "status": "ok",
                    "output": {"stdout": "line-1", "exit_code": 0},
                    "debug_trace": "trace-1",
                }
            ],
            "screenshot": None,
            "system_state": None,
            "error": None,
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert session_manager.session_instance.bundle_calls
    first_step = session_manager.session_instance.bundle_calls[0]["step_results"][0]
    assert first_step["tool"] == "run_shell_command"
    assert first_step["status"] == "ok"
    assert first_step["output"] == {"stdout": "line-1", "exit_code": 0}
    assert first_step["debug_trace"] == "trace-1"


def test_tool_result_handler_serializes_tool_result_data_model():
    session_manager = DummySessionManager()
    handler = ToolResultHandler(session_manager)

    serialized = handler._serialize_tool_result_data(
        ToolResultData(
            llm_content="done",
            system_state=ToolResultSystemState(
                active_window="Terminal",
                mouse_position="(1, 1)",
            ),
            screenshot_ref="artifact-1.png",
        )
    )

    assert serialized == {
        "llm_content": "done",
        "system_state": {
            "active_window": "Terminal",
            "mouse_position": "(1, 1)",
        },
        "screenshot_ref": "artifact-1.png",
    }


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
        payload={
            "request_id": "req_2",
            "success": True,
            "data": {
                "llm_content": "ok",
                "system_state": {
                    "active_window": "Unknown",
                    "mouse_position": "Unknown",
                },
            },
        },
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
async def test_load_settings_handler_returns_frontend_config():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    session_manager.session_instance = session_manager.session
    handler = LoadSettingsHandler(session_manager)

    message = LoadSettingsMessage(
        id="msg_11",
        type="load-settings",
        user_id="user_1",
        payload={},
    )

    await handler.handle(message, websocket, "user_1")

    assert websocket.sent
    assert websocket.sent[0]["type"] == "settings-loaded"
    assert websocket.sent[0]["payload"]["config"] == {
        "interaction_mode": "chat",
        "model_mode": "online",
        "model_provider": "openai",
        "selected_model_id": "gpt-5.1",
        "speech_mode_enabled": False,
        "voice_mode_enabled": False,
    }


@pytest.mark.asyncio
async def test_wakeword_handler_sends_activation_and_greeting():
    websocket = FakeWebSocket()
    handler = WakewordHandler(DummyTTSManager(), DummyWakewordService())
    message = WakewordDetectedMessage(
        id="msg_8", type="wakeword-detected", user_id="user_1"
    )

    await handler.handle(message, websocket, "user_1")
    assert len(websocket.sent) == 2
    assert websocket.sent[0]["type"] == "wakeword-activated"
    assert websocket.sent[1]["type"] == "wakeword-greeting"


@pytest.mark.asyncio
async def test_rehydrate_handler_rebuilds_session_history():
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    handler = RehydrateConversationHandler(session_manager)

    message = RehydrateConversationMessage(
        id="msg_rehydrate_1",
        type="rehydrate-conversation",
        user_id="user_1",
        payload={
            "conversation_ref": "conv_resume_1",
            "messages": [
                {
                    "role": "user",
                    "content": "hello",
                    "message_type": "user",
                    "timestamp": "2026-02-02T20:00:00Z",
                },
                {
                    "role": "assistant",
                    "content": "hi",
                    "message_type": "llm-text",
                    "timestamp": "2026-02-02T20:00:01Z",
                },
            ],
            "rehydrate_mode": "replace",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert session_manager.session.rehydrate_calls
    assert session_manager.session.rehydrate_calls[0]["conversation_ref"] == "conv_resume_1"
    assert len(session_manager.session.rehydrate_calls[0]["entries"]) == 2


@pytest.mark.asyncio
async def test_rehydrate_handler_ignores_missing_screenshot_ref(monkeypatch):
    websocket = FakeWebSocket()
    session_manager = DummySessionManager()
    handler = RehydrateConversationHandler(session_manager)

    class MissingArtifactStore:
        def load_base64(self, artifact_id: str):  # pragma: no cover - defensive shape
            raise RuntimeError(f"artifact missing: {artifact_id}")

    monkeypatch.setattr(
        rehydrate_execution_module.RehydrateExecutionService,
        "_build_artifact_store",
        lambda self, artifact_store_cls: MissingArtifactStore(),
    )

    message = RehydrateConversationMessage(
        id="msg_rehydrate_2",
        type="rehydrate-conversation",
        user_id="user_1",
        payload={
            "conversation_ref": "conv_resume_2",
            "messages": [
                {
                    "role": "user",
                    "content": "hello",
                    "message_type": "user",
                    "timestamp": "2026-02-02T20:00:00Z",
                    "screenshot_ref": "missing-artifact.jpg",
                },
                {
                    "role": "assistant",
                    "content": "hi",
                    "message_type": "llm-text",
                    "timestamp": "2026-02-02T20:00:01Z",
                },
            ],
            "rehydrate_mode": "replace",
        },
    )

    await handler.handle(message, websocket, "user_1")

    assert not websocket.sent
    assert session_manager.session.rehydrate_calls
    entries = session_manager.session.rehydrate_calls[0]["entries"]
    assert entries[0]["image_data"] is None
    assert entries[1]["image_data"] is None
