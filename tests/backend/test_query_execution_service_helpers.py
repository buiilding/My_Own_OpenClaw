from types import SimpleNamespace

import pytest

from backend.src.api.schema import QueryMessage
from backend.src.api.services.query_execution import (
    EMPTY_FINAL_RESPONSE_FALLBACK,
    QueryExecutionService,
)
from backend.src.core.events.streaming_events import ChunkEvent, StreamingCompleteEvent


def _build_message(
    *,
    system_state_internal=None,
    screenshot=None,
    screenshot_ref=None,
    screenshot_refs=None,
):
    return QueryMessage(
        id="msg-1",
        type="query",
        user_id="user-1",
        payload={
            "text": "hello",
            "conversation_ref": "conv-1",
            "system_state_internal": system_state_internal,
            "screenshot": screenshot,
            "screenshot_ref": screenshot_ref,
            "screenshot_refs": screenshot_refs,
        },
    )


def _build_service(session_manager=None):
    manager = session_manager or SimpleNamespace(config=SimpleNamespace())
    return QueryExecutionService(manager, tts_manager=object(), response_formatter=object())


def test_resolve_query_runtime_system_state_filters_to_allowed_string_keys():
    message = _build_message(
        system_state_internal={
            "active_window": "  Terminal  ",
            "mouse_position": "120,300",
            "screen_resolution": " 2560x1440 ",
            "ignored_field": "value",
            "non_string": 5,
        }
    )

    state = QueryExecutionService._resolve_query_runtime_system_state(message)

    assert state == {
        "active_window": "Terminal",
        "mouse_position": "120,300",
        "screen_resolution": "2560x1440",
    }


def test_resolve_query_runtime_system_state_returns_none_for_missing_or_invalid_payload():
    assert QueryExecutionService._resolve_query_runtime_system_state(_build_message()) is None

    fake_message = SimpleNamespace(payload=SimpleNamespace(system_state_internal=["not", "a", "dict"]))
    assert (
        QueryExecutionService._resolve_query_runtime_system_state(fake_message) is None
    )


def test_apply_query_runtime_system_state_merges_existing_values():
    observed = {}

    class _Agent:
        def get_current_system_state(self):
            return {
                "mouse_position": "10,20",
                "screen_resolution": "1920x1080",
            }

        def set_current_system_state(self, state):
            observed["state"] = state

    service = _build_service()
    message = _build_message(
        system_state_internal={
            "active_window": " Browser ",
            "screen_resolution": "3840x2160",
        }
    )

    service._apply_query_runtime_system_state(_Agent(), message)

    assert observed["state"] == {
        "mouse_position": "10,20",
        "screen_resolution": "3840x2160",
        "active_window": "Browser",
    }


def test_apply_query_runtime_system_state_ignores_missing_setter():
    class _Agent:
        pass

    service = _build_service()
    service._apply_query_runtime_system_state(_Agent(), _build_message(system_state_internal={"active_window": "x"}))


def test_build_stream_context_uses_agent_identifiers():
    agent = SimpleNamespace(user_id="u-1", session_id="s-1")
    context = QueryExecutionService._build_stream_context(
        agent_instance=agent,
        msg_id="turn-1",
        conversation_ref="conv-1",
    )

    assert context == {
        "user_id": "u-1",
        "session_id": "s-1",
        "conversation_ref": "conv-1",
        "turn_ref": "turn-1",
    }


def test_resolve_screenshot_prioritizes_inline_data():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError("artifact store should not be constructed for inline screenshots")

    service = _build_service()
    message = _build_message(screenshot="inline-b64", screenshot_ref="artifact-ref")

    assert service._resolve_screenshot(message, _ArtifactStore) == "inline-b64"


def test_resolve_screenshot_loads_artifact_ref_when_inline_missing():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref):
            return f"resolved:{screenshot_ref}"

    service = _build_service()
    message = _build_message(screenshot=None, screenshot_ref="artifact-ref")

    assert service._resolve_screenshot(message, _ArtifactStore) == "resolved:artifact-ref"


def test_resolve_screenshots_loads_multi_artifact_refs_when_provided():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref):
            return f"resolved:{screenshot_ref}"

    service = _build_service()
    message = _build_message(
        screenshot=None,
        screenshot_refs=["artifact-1", "artifact-2"],
    )

    assert service._resolve_screenshots(message, _ArtifactStore) == [
        "resolved:artifact-1",
        "resolved:artifact-2",
    ]


def test_resolve_screenshots_trims_refs_and_skips_blank_entries():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref):
            calls.append(screenshot_ref)
            return f"resolved:{screenshot_ref}"

    service = _build_service()
    message = _build_message(
        screenshot=None,
        screenshot_refs=[" artifact-1 ", "   ", "artifact-2"],
    )

    assert service._resolve_screenshots(message, _ArtifactStore) == [
        "resolved:artifact-1",
        "resolved:artifact-2",
    ]
    assert calls == ["artifact-1", "artifact-2"]


def test_resolve_screenshots_returns_none_for_blank_single_ref():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError("artifact store should not be initialized")

    service = _build_service()
    message = _build_message(screenshot=None, screenshot_ref="   ")

    assert service._resolve_screenshots(message, _ArtifactStore) is None


def test_resolve_screenshots_falls_back_to_single_ref_when_ref_list_is_blank_only():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref):
            calls.append(screenshot_ref)
            return f"resolved:{screenshot_ref}"

    service = _build_service()
    message = _build_message(
        screenshot=None,
        screenshot_ref="legacy-ref",
        screenshot_refs=["   ", ""],
    )

    assert service._resolve_screenshots(message, _ArtifactStore) == [
        "resolved:legacy-ref"
    ]
    assert calls == ["legacy-ref"]


def test_resolve_screenshots_keeps_successful_refs_when_one_load_fails():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref):
            calls.append(screenshot_ref)
            if screenshot_ref == "bad-ref":
                raise RuntimeError("missing artifact")
            return f"resolved:{screenshot_ref}"

    service = _build_service()
    message = _build_message(
        screenshot=None,
        screenshot_refs=["ok-ref", "bad-ref", "ok-ref-2"],
    )

    assert service._resolve_screenshots(message, _ArtifactStore) == [
        "resolved:ok-ref",
        "resolved:ok-ref-2",
    ]
    assert calls == ["ok-ref", "bad-ref", "ok-ref-2"]


def test_resolve_screenshots_returns_trimmed_inline_without_store():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError("artifact store should not be initialized")

    service = _build_service()
    message = _build_message(
        screenshot="  inline-b64  ",
        screenshot_ref="artifact-ref",
    )

    assert service._resolve_screenshots(message, _ArtifactStore) == ["inline-b64"]


def test_resolve_screenshot_returns_none_when_artifact_load_fails():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, _screenshot_ref):
            raise RuntimeError("missing artifact")

    service = _build_service()
    message = _build_message(screenshot=None, screenshot_ref="artifact-ref")

    assert service._resolve_screenshot(message, _ArtifactStore) is None


def test_resolve_screenshot_returns_none_when_no_inline_or_ref():
    service = _build_service()
    message = _build_message(screenshot=None, screenshot_ref=None)

    assert service._resolve_screenshot(message, artifact_store_cls=object) is None


def test_finalize_pending_tool_calls_on_cancel_handles_success_and_failures():
    class _HistoryOk:
        def __init__(self):
            self.calls = 0

        def finalize_pending_tool_calls_as_cancelled(self):
            self.calls += 1
            return "2"

    class _HistoryErr:
        def finalize_pending_tool_calls_as_cancelled(self):
            raise RuntimeError("boom")

    agent_ok = SimpleNamespace(history=_HistoryOk(), user_id="u", session_id="s")
    QueryExecutionService._finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_ok,
        msg_id="turn-1",
        conversation_ref="conv-1",
    )
    assert agent_ok.history.calls == 1

    agent_err = SimpleNamespace(history=_HistoryErr(), user_id="u", session_id="s")
    QueryExecutionService._finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_err,
        msg_id="turn-2",
        conversation_ref="conv-2",
    )

    agent_noop = SimpleNamespace(history=SimpleNamespace(), user_id="u", session_id="s")
    QueryExecutionService._finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_noop,
        msg_id="turn-3",
        conversation_ref="conv-3",
    )


def test_query_execution_extract_wrapper_methods_passthrough():
    service_cls = QueryExecutionService

    assert service_cls._extract_event_type({"type": "chunk"}) == "chunk"
    assert service_cls._extract_dict_payload({"payload": {"x": 1}}) == {"x": 1}
    assert (
        service_cls._extract_dict_string_field(
            {"payload": {"text": "hello"}},
            top_level_key="content",
            payload_key="text",
        )
        == "hello"
    )
    assert service_cls._extract_chunk_text({"content": "chunk"}) == "chunk"


def test_query_execution_resolve_completion_text_wrapper_uses_empty_fallback():
    service_cls = QueryExecutionService

    fallback = service_cls._resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=[],
        assistant_full_text="",
        saw_text_chunk=False,
    )
    assert fallback == EMPTY_FINAL_RESPONSE_FALLBACK


@pytest.mark.asyncio
async def test_emit_completion_events_emits_backfill_chunk_then_terminal_event():
    observed = []

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed.append((event, tts_service, msg_id, context))

    service = _build_service()
    stream_context = {"user_id": "u-1"}

    saw_text_chunk = await service._emit_completion_events(
        pipeline=_Pipeline(),
        tts_service=None,
        msg_id="turn-1",
        stream_context=stream_context,
        completion_text="final text",
        saw_text_chunk=False,
    )

    assert saw_text_chunk is True
    assert isinstance(observed[0][0], ChunkEvent)
    assert observed[0][0].content == "final text"
    assert isinstance(observed[1][0], StreamingCompleteEvent)
    assert observed[1][0].final_response == "final text"
    assert observed[0][3] is stream_context
    assert observed[1][3] is stream_context


@pytest.mark.asyncio
async def test_process_pipeline_event_forwards_event_and_context():
    observed = {}

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed["event"] = event
            observed["tts_service"] = tts_service
            observed["msg_id"] = msg_id
            observed["context"] = context

    event = ChunkEvent(content="hi")
    context = {"turn_ref": "turn-1"}
    await QueryExecutionService._process_pipeline_event(
        pipeline=_Pipeline(),
        event=event,
        tts_service="tts",
        msg_id="turn-1",
        stream_context=context,
    )

    assert observed == {
        "event": event,
        "tts_service": "tts",
        "msg_id": "turn-1",
        "context": context,
    }


@pytest.mark.asyncio
async def test_emit_completion_events_skips_backfill_when_chunk_already_seen():
    observed = []

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed.append(event)

    service = _build_service()
    saw_text_chunk = await service._emit_completion_events(
        pipeline=_Pipeline(),
        tts_service=None,
        msg_id="turn-1",
        stream_context={"user_id": "u-1"},
        completion_text="already streamed",
        saw_text_chunk=True,
    )

    assert saw_text_chunk is True
    assert len(observed) == 1
    assert isinstance(observed[0], StreamingCompleteEvent)
