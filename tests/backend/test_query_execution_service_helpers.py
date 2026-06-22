"""Covers query execution service helpers behavior in the backend test suite."""

import asyncio
from types import SimpleNamespace

import pytest

from backend.src.api.schemas.incoming import QueryMessage
from backend.src.api.services.query_execution import (
    EMPTY_FINAL_RESPONSE_FALLBACK,
    QueryExecutionService,
)
from backend.src.api.services.query_event_extraction import (
    extract_chunk_text,
    extract_dict_payload,
    extract_dict_string_field,
    extract_event_type,
    resolve_completion_text,
)
from backend.src.api.services.query_execution_support.query_execution_completion import (
    complete_query_stream,
    resolve_query_completion_text,
)
from backend.src.api.services.query_execution_support.query_execution_cancellation import (
    finalize_pending_tool_calls_on_cancel,
)
from backend.src.api.services.query_execution_support.query_execution_runtime import (
    apply_query_runtime_system_state,
    build_stream_context,
    resolve_query_runtime_system_state,
    resolve_screenshots,
)
from backend.src.api.services.query_execution_support.query_execution_stream_state import (
    QueryExecutionStreamState,
)
from backend.src.core.events.streaming_events import (
    ChunkEvent,
    StreamingCompleteEvent,
    TraceEvent,
)


def _build_message(
    *,
    screenshot=None,
    system_state_internal=None,
    screenshot_ref=None,
    screenshot_refs=None,
):
    _ = screenshot
    return QueryMessage(
        id="msg-1",
        type="query",
        user_id="user-1",
        payload={
            "text": "hello",
            "conversation_ref": "conv-1",
            "content": "<user_query>\nhello\n</user_query>",
            "system_state_internal": system_state_internal,
            "screenshot_ref": screenshot_ref,
            "screenshot_refs": screenshot_refs,
        },
    )


def _build_service(session_manager=None):
    manager = session_manager or SimpleNamespace(config=SimpleNamespace())
    return QueryExecutionService(
        manager, tts_manager=object(), response_formatter=object()
    )


class _FakeWebSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)


def _non_trace_events(observed_events):
    return [
        event
        for event, _context in observed_events
        if not isinstance(event, TraceEvent)
    ]


def _trace_events(observed_events):
    return [
        event for event, _context in observed_events if isinstance(event, TraceEvent)
    ]


def _first_screenshot(
    message,
    *,
    artifact_store_cls,
    session_manager_config,
):
    screenshots = resolve_screenshots(
        message,
        artifact_store_cls=artifact_store_cls,
        session_manager_config=session_manager_config,
    )
    return screenshots[0] if screenshots else None


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

    state = resolve_query_runtime_system_state(message)

    assert state == {
        "active_window": "Terminal",
        "mouse_position": "120,300",
        "screen_resolution": "2560x1440",
    }


def test_resolve_query_runtime_system_state_returns_none_for_missing_or_invalid_payload():
    assert resolve_query_runtime_system_state(_build_message()) is None

    fake_message = SimpleNamespace(
        payload=SimpleNamespace(system_state_internal=["not", "a", "dict"])
    )
    assert resolve_query_runtime_system_state(fake_message) is None


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

    message = _build_message(
        system_state_internal={
            "active_window": " Browser ",
            "screen_resolution": "3840x2160",
        }
    )

    apply_query_runtime_system_state(_Agent(), message)

    assert observed["state"] == {
        "mouse_position": "10,20",
        "screen_resolution": "3840x2160",
        "active_window": "Browser",
    }


def test_apply_query_runtime_system_state_ignores_missing_setter():
    class _Agent:
        pass

    apply_query_runtime_system_state(
        _Agent(),
        _build_message(system_state_internal={"active_window": "x"}),
    )


def test_apply_query_runtime_system_state_continues_when_getter_fails():
    observed = {}

    class _Agent:
        def get_current_system_state(self):
            raise RuntimeError("state unavailable")

        def set_current_system_state(self, state):
            observed["state"] = state

    apply_query_runtime_system_state(
        _Agent(),
        _build_message(
            system_state_internal={
                "active_window": " Terminal ",
                "mouse_position": " 12,34 ",
            }
        ),
    )

    assert observed["state"] == {
        "active_window": "Terminal",
        "mouse_position": "12,34",
    }


def test_build_stream_context_uses_agent_identifiers():
    agent = SimpleNamespace(user_id="u-1", session_id="s-1")
    context = build_stream_context(
        agent_instance=agent,
        msg_id="turn-1",
        conversation_ref="conv-1",
    )

    assert (
        context.items()
        >= {
            "user_id": "u-1",
            "session_id": "s-1",
            "conversation_ref": "conv-1",
            "turn_ref": "turn-1",
        }.items()
    )


def test_active_stream_context_helpers_delegate_when_supported():
    calls = []

    class _Agent:
        def set_active_stream_context(self, *, turn_ref, conversation_ref):
            calls.append(("set", turn_ref, conversation_ref))

        def clear_active_stream_context(self, *, turn_ref):
            calls.append(("clear", turn_ref, None))

    agent = _Agent()

    QueryExecutionService._set_active_stream_context(
        agent_instance=agent,
        msg_id="turn-2",
        conversation_ref="conv-2",
    )
    QueryExecutionService._clear_active_stream_context(
        agent_instance=agent,
        msg_id="turn-2",
    )

    assert calls == [
        ("set", "turn-2", "conv-2"),
        ("clear", "turn-2", None),
    ]


def test_resolve_screenshot_loads_artifact_ref_when_inline_missing():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, owner_user_id=None):
            return f"resolved:{screenshot_ref}"

    message = _build_message(screenshot=None, screenshot_ref="artifact-ref")
    assert (
        _first_screenshot(
            message,
            artifact_store_cls=_ArtifactStore,
            session_manager_config=SimpleNamespace(),
        )
        == "resolved:artifact-ref"
    )


def test_resolve_screenshots_loads_multi_artifact_refs_when_provided():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, owner_user_id=None):
            return f"resolved:{screenshot_ref}"

    message = _build_message(
        screenshot=None,
        screenshot_refs=["artifact-1", "artifact-2"],
    )

    assert resolve_screenshots(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=SimpleNamespace(),
    ) == [
        "resolved:artifact-1",
        "resolved:artifact-2",
    ]


def test_resolve_screenshots_trims_refs_and_skips_blank_entries():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, owner_user_id=None):
            calls.append(screenshot_ref)
            return f"resolved:{screenshot_ref}"

    message = _build_message(
        screenshot=None,
        screenshot_refs=[" artifact-1 ", "   ", "artifact-2"],
    )

    assert resolve_screenshots(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=SimpleNamespace(),
    ) == [
        "resolved:artifact-1",
        "resolved:artifact-2",
    ]
    assert calls == ["artifact-1", "artifact-2"]


def test_resolve_screenshots_returns_none_for_blank_single_ref():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            raise AssertionError("artifact store should not be initialized")

    message = _build_message(screenshot=None, screenshot_ref="   ")

    assert (
        resolve_screenshots(
            message,
            artifact_store_cls=_ArtifactStore,
            session_manager_config=SimpleNamespace(),
        )
        is None
    )


def test_resolve_screenshots_falls_back_to_single_ref_when_ref_list_is_blank_only():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, owner_user_id=None):
            calls.append(screenshot_ref)
            return f"resolved:{screenshot_ref}"

    message = _build_message(
        screenshot=None,
        screenshot_ref="legacy-ref",
        screenshot_refs=["   ", ""],
    )

    assert resolve_screenshots(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=SimpleNamespace(),
    ) == ["resolved:legacy-ref"]
    assert calls == ["legacy-ref"]


def test_resolve_screenshots_keeps_successful_refs_when_one_load_fails():
    calls: list[str] = []

    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, screenshot_ref, owner_user_id=None):
            calls.append(screenshot_ref)
            if screenshot_ref == "bad-ref":
                raise RuntimeError("missing artifact")
            return f"resolved:{screenshot_ref}"

    message = _build_message(
        screenshot=None,
        screenshot_refs=["ok-ref", "bad-ref", "ok-ref-2"],
    )

    assert resolve_screenshots(
        message,
        artifact_store_cls=_ArtifactStore,
        session_manager_config=SimpleNamespace(),
    ) == [
        "resolved:ok-ref",
        "resolved:ok-ref-2",
    ]
    assert calls == ["ok-ref", "bad-ref", "ok-ref-2"]


def test_resolve_screenshot_returns_none_when_artifact_load_fails():
    class _ArtifactStore:
        @classmethod
        def from_config(cls, _config):
            return cls()

        def load_base64(self, _screenshot_ref):
            raise RuntimeError("missing artifact")

    message = _build_message(screenshot=None, screenshot_ref="artifact-ref")

    assert (
        _first_screenshot(
            message,
            artifact_store_cls=_ArtifactStore,
            session_manager_config=SimpleNamespace(),
        )
        is None
    )


def test_resolve_screenshot_returns_none_when_no_inline_or_ref():
    message = _build_message(screenshot=None, screenshot_ref=None)

    assert (
        _first_screenshot(
            message,
            artifact_store_cls=object,
            session_manager_config=SimpleNamespace(),
        )
        is None
    )


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
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_ok,
        msg_id="turn-1",
        conversation_ref="conv-1",
    )
    assert agent_ok.history.calls == 1

    agent_err = SimpleNamespace(history=_HistoryErr(), user_id="u", session_id="s")
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_err,
        msg_id="turn-2",
        conversation_ref="conv-2",
    )

    agent_noop = SimpleNamespace(history=SimpleNamespace(), user_id="u", session_id="s")
    finalize_pending_tool_calls_on_cancel(
        agent_instance=agent_noop,
        msg_id="turn-3",
        conversation_ref="conv-3",
    )


def test_query_execution_event_extraction_helpers_passthrough():
    assert extract_event_type({"type": "streaming-response"}) == "streaming-response"
    assert extract_dict_payload({"payload": {"x": 1}}) == {"x": 1}
    assert (
        extract_dict_string_field(
            {"payload": {"text": "hello"}},
            top_level_key="content",
            payload_key="text",
        )
        == "hello"
    )
    assert extract_chunk_text({"content": "chunk"}) == "chunk"


def test_query_execution_resolve_completion_text_helper_uses_empty_fallback():
    fallback = resolve_completion_text(
        event=None,
        event_type=None,
        text_chunks=[],
        assistant_full_text="",
        saw_text_chunk=False,
        empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
    )
    assert fallback == EMPTY_FINAL_RESPONSE_FALLBACK


@pytest.mark.asyncio
async def test_complete_query_stream_marks_terminal_and_emits_backfill_chunk_then_terminal_event():
    observed = []

    class _Pipeline:
        async def process(self, event, tts_service, msg_id, context):
            observed.append((event, tts_service, msg_id, context))

    state = QueryExecutionStreamState()

    saw_text_chunk = await complete_query_stream(
        pipeline=_Pipeline(),
        tts_service=None,
        msg_id="turn-1",
        stream_context={"user_id": "u-1"},
        stream_state=state,
        event=None,
        event_type=None,
        empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
    )

    assert state.saw_terminal_event is True
    assert saw_text_chunk is True
    assert isinstance(observed[0][0], ChunkEvent)
    assert observed[0][0].content == EMPTY_FINAL_RESPONSE_FALLBACK
    assert isinstance(observed[1][0], StreamingCompleteEvent)
    assert observed[1][0].final_response == EMPTY_FINAL_RESPONSE_FALLBACK


def test_resolve_query_completion_text_prefers_event_completion_then_state_fallbacks():
    state = QueryExecutionStreamState(
        saw_text_chunk=True,
        text_chunks=["partial ", "answer"],
        last_assistant_full_text="assistant full",
    )

    assert (
        resolve_query_completion_text(
            stream_state=state,
            event={"type": "streaming-complete", "payload": {"final_response": "done"}},
            event_type="streaming-complete",
            empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
        )
        == "done"
    )
    assert (
        resolve_query_completion_text(
            stream_state=state,
            event=None,
            event_type=None,
            empty_fallback=EMPTY_FINAL_RESPONSE_FALLBACK,
        )
        == "partial answer"
    )


@pytest.mark.asyncio
async def test_execute_emits_fallback_completion_when_agent_stream_ends_without_terminal_event():
    observed_events = []

    class _Pipeline:
        def __init__(self, *_args, **_kwargs):
            pass

        async def process(self, event, _tts_service, _msg_id, context):
            observed_events.append((event, context))

        async def wait_for_pending_tts(self):
            return None

    class _TtsManager:
        async def initialize_if_enabled(self, _config):
            return None

        async def cleanup(self, _service, _task):
            return None

    class _SessionManager:
        def __init__(self):
            self.config = SimpleNamespace()

        async def get_or_create_session(self, _user_id, conversation_ref=None):
            _ = conversation_ref

            class _Agent:
                user_id = "user-1"
                session_id = "session-1"
                cfg = SimpleNamespace()

                async def process_query(self, *_args, **_kwargs):
                    yield {"type": "streaming-response", "payload": {"text": "hello "}}
                    yield {"type": "assistant-message-full", "content": "hello there"}

            return _Agent()

    service = QueryExecutionService(
        _SessionManager(),
        tts_manager=_TtsManager(),
        response_formatter=object(),
    )

    await service.execute(
        _build_message(),
        websocket=_FakeWebSocket(),
        user_id="user-1",
        pipeline_cls=_Pipeline,
    )

    non_trace_events = _non_trace_events(observed_events)
    trace_events = _trace_events(observed_events)

    assert len(non_trace_events) == 3
    assert non_trace_events[0]["type"] == "streaming-response"
    assert non_trace_events[1]["type"] == "assistant-message-full"
    assert isinstance(non_trace_events[2], StreamingCompleteEvent)
    assert non_trace_events[2].final_response == "hello"
    assert [event.status for event in trace_events] == ["started", "succeeded"]
    assert trace_events[1].path == "backend.stream"
    assert trace_events[1].data == {
        "eventCount": 2,
        "chunkCount": 1,
        "toolCallCount": 0,
        "toolOutputCount": 0,
        "sawTerminalEvent": True,
        "terminalEventType": None,
        "fallbackCompletionUsed": True,
    }


@pytest.mark.asyncio
async def test_execute_emits_sanitized_tts_playback_trace_when_voice_enabled():
    observed_events = []

    class _TtsService:
        async def flush(self):
            return None

        async def shutdown(self):
            return None

    class _Pipeline:
        def __init__(self, *_args, **_kwargs):
            pass

        async def process(self, event, _tts_service, _msg_id, context):
            observed_events.append((event, context))

        async def wait_for_pending_tts(self):
            return None

    class _TtsManager:
        async def initialize_if_enabled(self, _config):
            return _TtsService()

        async def start_streaming_task(self, _service, _websocket, _msg_id):
            task = asyncio.get_running_loop().create_future()
            task.set_result(None)
            return task

        async def cleanup(self, _service, _task):
            return None

    class _SessionManager:
        def __init__(self):
            self.config = SimpleNamespace()

        async def get_or_create_session(self, _user_id, conversation_ref=None):
            _ = conversation_ref

            class _Agent:
                user_id = "user-1"
                session_id = "session-1"
                cfg = SimpleNamespace(
                    speech_mode_enabled=True,
                    speech_provider="local",
                )

                async def process_query(self, *_args, **_kwargs):
                    yield ChunkEvent(content="spoken secret text")
                    yield StreamingCompleteEvent(final_response="spoken secret text")

            return _Agent()

    service = QueryExecutionService(
        _SessionManager(),
        tts_manager=_TtsManager(),
        response_formatter=object(),
    )

    await service.execute(
        _build_message(),
        websocket=_FakeWebSocket(),
        user_id="user-1",
        pipeline_cls=_Pipeline,
    )

    tts_events = [
        event
        for event in _trace_events(observed_events)
        if event.path == "tts.playback"
    ]
    assert [event.status for event in tts_events] == ["started", "succeeded"]
    assert tts_events[0].data == {
        "speechModeEnabled": True,
        "ttsEnabled": False,
        "hasTtsService": True,
        "hasAudioTask": True,
        "provider": "local",
    }
    assert tts_events[1].data == {
        "hasTtsService": True,
        "hasAudioTask": True,
        "audioTaskDone": True,
    }
    assert "spoken secret text" not in repr([event.to_dict() for event in tts_events])


@pytest.mark.asyncio
async def test_execute_ignores_post_error_events_and_skips_fallback_completion():
    observed_events = []

    class _Pipeline:
        def __init__(self, *_args, **_kwargs):
            pass

        async def process(self, event, _tts_service, _msg_id, context):
            observed_events.append((event, context))

        async def wait_for_pending_tts(self):
            return None

    class _TtsManager:
        async def initialize_if_enabled(self, _config):
            return None

        async def cleanup(self, _service, _task):
            return None

    class _SessionManager:
        def __init__(self):
            self.config = SimpleNamespace()

        async def get_or_create_session(self, _user_id, conversation_ref=None):
            _ = conversation_ref

            class _Agent:
                user_id = "user-1"
                session_id = "session-1"
                cfg = SimpleNamespace()

                async def process_query(self, *_args, **_kwargs):
                    yield {"type": "streaming-response", "payload": {"text": "hello "}}
                    yield {"type": "error", "payload": {"message": "tool failed"}}
                    # Post-terminal events from the same stream must be ignored.
                    yield {
                        "type": "streaming-response",
                        "payload": {"text": "should-not-emit"},
                    }
                    yield {
                        "type": "streaming-complete",
                        "payload": {"final_response": "ignored"},
                    }

            return _Agent()

    service = QueryExecutionService(
        _SessionManager(),
        tts_manager=_TtsManager(),
        response_formatter=object(),
    )

    await service.execute(
        _build_message(),
        websocket=_FakeWebSocket(),
        user_id="user-1",
        pipeline_cls=_Pipeline,
    )

    assert [event["type"] for event in _non_trace_events(observed_events)] == [
        "streaming-response",
        "error",
    ]
    assert not any(
        isinstance(event, StreamingCompleteEvent)
        for event in _non_trace_events(observed_events)
    )
    assert [event.status for event in _trace_events(observed_events)] == [
        "started",
        "succeeded",
    ]


@pytest.mark.asyncio
async def test_execute_drops_events_after_terminal_completion():
    observed_events = []

    class _Pipeline:
        def __init__(self, *_args, **_kwargs):
            pass

        async def process(self, event, _tts_service, _msg_id, context):
            observed_events.append((event, context))

        async def wait_for_pending_tts(self):
            return None

    class _TtsManager:
        async def initialize_if_enabled(self, _config):
            return None

        async def cleanup(self, _service, _task):
            return None

    class _SessionManager:
        def __init__(self):
            self.config = SimpleNamespace()

        async def get_or_create_session(self, _user_id, conversation_ref=None):
            _ = conversation_ref

            class _Agent:
                user_id = "user-1"
                session_id = "session-1"
                cfg = SimpleNamespace()

                async def process_query(self, *_args, **_kwargs):
                    yield {"type": "streaming-response", "payload": {"text": "hello "}}
                    yield {
                        "type": "streaming-complete",
                        "payload": {"final_response": "hello"},
                    }
                    yield {
                        "type": "streaming-response",
                        "payload": {"text": "late"},
                    }

            return _Agent()

    service = QueryExecutionService(
        _SessionManager(),
        tts_manager=_TtsManager(),
        response_formatter=object(),
    )

    await service.execute(
        _build_message(),
        websocket=_FakeWebSocket(),
        user_id="user-1",
        pipeline_cls=_Pipeline,
    )

    non_trace_events = _non_trace_events(observed_events)
    assert non_trace_events[0]["type"] == "streaming-response"
    assert isinstance(non_trace_events[1], StreamingCompleteEvent)
    assert non_trace_events[1].final_response == "hello"
    assert len(non_trace_events) == 2


@pytest.mark.asyncio
async def test_execute_re_raises_cancellation_and_reconciles_pending_tool_calls():
    observed_events = []

    class _Pipeline:
        def __init__(self, *_args, **_kwargs):
            pass

        async def process(self, event, _tts_service, _msg_id, context):
            observed_events.append((event, context))

        async def wait_for_pending_tts(self):
            return None

    class _TtsManager:
        async def initialize_if_enabled(self, _config):
            return None

        async def cleanup(self, _service, _task):
            return None

    class _History:
        def __init__(self):
            self.cancel_finalize_calls = 0

        def finalize_pending_tool_calls_as_cancelled(self):
            self.cancel_finalize_calls += 1
            return 1

    class _Agent:
        user_id = "user-1"
        session_id = "session-1"
        cfg = SimpleNamespace()

        def __init__(self):
            self.history = _History()

        async def process_query(self, *_args, **_kwargs):
            yield {"type": "streaming-response", "payload": {"text": "hello "}}
            raise asyncio.CancelledError()

    class _SessionManager:
        def __init__(self):
            self.config = SimpleNamespace()
            self.agent = _Agent()

        async def get_or_create_session(self, _user_id, conversation_ref=None):
            _ = conversation_ref
            return self.agent

    session_manager = _SessionManager()
    service = QueryExecutionService(
        session_manager,
        tts_manager=_TtsManager(),
        response_formatter=object(),
    )

    with pytest.raises(asyncio.CancelledError):
        await service.execute(
            _build_message(),
            websocket=_FakeWebSocket(),
            user_id="user-1",
            pipeline_cls=_Pipeline,
        )

    assert session_manager.agent.history.cancel_finalize_calls == 1
    assert [event["type"] for event in _non_trace_events(observed_events)] == [
        "streaming-response"
    ]
    assert not any(
        isinstance(event, StreamingCompleteEvent)
        for event in _non_trace_events(observed_events)
    )
    assert [event.status for event in _trace_events(observed_events)] == ["started"]
