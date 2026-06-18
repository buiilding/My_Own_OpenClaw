"""Tests for InteractionLoop fallback behavior."""

from __future__ import annotations

import pytest

from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.core.events.streaming_events import (
    AssistantMessageFullEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
    TraceEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.infrastructure.user_facing_errors import (
    INTERNAL_SERVER_ERROR_MESSAGE,
)
from backend.src.core.types.enums import MessageRole, MessageType


class _FakeConfig:
    pass


class _FakeHistory:
    def __init__(self, stored_messages):
        self._stored_messages = list(stored_messages)
        self.assistant_messages = []
        self.tool_outputs = []
        self.staged_tool_call_ids = []

    def add_assistant_message(self, message, tool_calls=None):
        self.assistant_messages.append((message, tool_calls))

    def stage_tool_call_ids(self, tool_call_ids, consume_all_on_next_output=False):
        self.staged_tool_call_ids.append(
            (list(tool_call_ids), consume_all_on_next_output)
        )

    def add_tool_output(self, message, image_data=None, **kwargs):
        self.tool_outputs.append((message, image_data, kwargs))

    def get_stored_messages(self):
        return list(self._stored_messages)


class _FakeSession:
    def __init__(self, stored_messages):
        self.cfg = _FakeConfig()
        self.history = _FakeHistory(stored_messages)
        self.session_id = "session-test"


class _FakePromptCoordinator:
    def get_prompt(self, iteration):
        return ([{"role": "user", "content": "Do thing"}], [], None)


class _FakeLLMHandler:
    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        yield FullResponseEvent(content="")

    def get_last_response_payload(self):
        return {"content": ""}


class _FakeToolExecutor:
    def __init__(self):
        self.execute_called = False

    async def execute(self, parsed_response, session):
        self.execute_called = True
        if False:
            yield None

    async def process_results(self, parsed_response, session):
        return None


class _CapturingToolExecutor:
    def __init__(self):
        self.execute_called = False
        self.executed_tool_names = []
        self.executed_parameters = []
        self.process_results_calls = 0

    async def execute(self, parsed_response, session):
        _ = session
        self.execute_called = True
        self.executed_tool_names = [
            call.tool_name for call in parsed_response.tool_calls
        ]
        self.executed_parameters = [
            dict(call.parameters) for call in parsed_response.tool_calls
        ]
        if False:
            yield None

    async def process_results(self, parsed_response, session):
        _ = (parsed_response, session)
        self.process_results_calls += 1
        return None


class _FakeEventPresenter:
    async def present_prompt_metadata(self, metadata):
        if False:
            yield None

    async def present_assistant_message(self, content):
        yield AssistantMessageFullEvent(content=content)

    async def present_completion(self, final_response):
        yield StreamingCompleteEvent(final_response=final_response)

    async def present_error(self, error_message):
        yield ErrorEvent(content=error_message)


@pytest.mark.asyncio
async def test_interaction_loop_emits_sanitized_prompt_and_provider_trace_events():
    session = _FakeSession([])

    class _PromptCoordinator:
        def get_prompt(self, iteration):
            return (
                [{"role": "user", "content": "secret prompt text"}],
                [{"type": "function", "name": "read_file", "parameters": {}}],
                None,
            )

    class _LLMHandler:
        async def get_response(self, prompt, tools=None, **_kwargs):
            yield FullResponseEvent(content="secret provider response")

        def get_last_response_payload(self):
            return {"content": "secret provider response"}

    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_PromptCoordinator(),
        llm_handler=_LLMHandler(),
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]
    trace_events = [event for event in events if isinstance(event, TraceEvent)]

    assert [(event.path, event.stage, event.status) for event in trace_events[:5]] == [
        ("backend.prompt", "build", "started"),
        ("backend.prompt", "build", "succeeded"),
        ("tool.schema.policy", "project", "succeeded"),
        ("provider.call", "request", "started"),
        ("provider.call", "request", "succeeded"),
    ]
    assert trace_events[1].data == {
        "iteration": 1,
        "promptMode": "initial",
        "promptMessageCount": 1,
        "toolSchemaCount": 1,
        "hasPromptMetadata": False,
        "capabilityRevision": None,
        "finalToolSourceCounts": {
            "builtin": 1,
            "client": 0,
            "mcp": 0,
            "plugin": 0,
            "backend_remote": 0,
        },
        "finalPromptLayerCount": 0,
    }
    assert trace_events[2].data == {
        "iteration": 1,
        "toolSchemaCount": 1,
        "hasToolSchemas": True,
        "promptMode": "initial",
    }
    assert trace_events[4].data == {
        "iteration": 1,
        "modelId": None,
        "modelProvider": None,
        "promptMessageCount": 1,
        "toolSchemaCount": 1,
        "responseLength": len("secret provider response"),
    }
    serialized = repr([event.to_dict() for event in trace_events])
    assert "secret prompt text" not in serialized
    assert "secret provider response" not in serialized


@pytest.mark.asyncio
async def test_interaction_loop_emits_fallback_when_final_response_empty_after_tool_output():
    stored_messages = [
        StoredMessage(
            role=MessageRole.USER,
            content=(
                "replace output:\n"
                "Created requirements.txt\n"
                "status: successful\n"
                "<system_context>...</system_context>"
            ),
            message_type=MessageType.TOOL_OUTPUT,
        ),
    ]
    session = _FakeSession(stored_messages)

    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_FakeLLMHandler(),
        tool_executor=_FakeToolExecutor(),
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assistant_full_events = [
        event for event in events if isinstance(event, AssistantMessageFullEvent)
    ]
    assert len(assistant_full_events) == 1
    assert "empty final response" in assistant_full_events[0].content
    assert "replace output" in assistant_full_events[0].content
    assert "<system_context>" not in assistant_full_events[0].content

    completion_events = [
        event for event in events if isinstance(event, StreamingCompleteEvent)
    ]
    assert len(completion_events) == 1
    assert completion_events[0].final_response == assistant_full_events[0].content

    assert session.history.assistant_messages[-1][0] == assistant_full_events[0].content


def test_recoverable_tool_call_error_requires_provider_metadata():
    error_msg = (
        "Invalid response from stream: failed to parse streamed tool-call arguments "
        "for id=call_bad name=replace"
    )

    assert (
        InteractionLoop._is_recoverable_llm_tool_call_error(
            error_msg,
            {"llm_tool_call_parse_failed": True},
        )
        is True
    )
    assert InteractionLoop._is_recoverable_llm_tool_call_error(error_msg, None) is False
    assert (
        InteractionLoop._is_recoverable_llm_tool_call_error(
            error_msg,
            {"llm_tool_call_parse_failed": False},
        )
        is False
    )


class _ErrorOnlyLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        self.calls += 1
        if self.calls == 1:
            yield ErrorEvent(
                content=(
                    "Unexpected system error: Invalid response from stream: "
                    "failed to parse streamed tool-call arguments for id=tool_bad name=replace."
                ),
                metadata={
                    "llm_tool_call_parse_failed": True,
                    "llm_tool_call_id": "tool_bad",
                    "llm_tool_name": "replace",
                    "llm_tool_call_raw_tool_call_preview": (
                        '{"id":"tool_bad","name":"replace","arguments":"'
                        '{\\"command\\":\\"cat > index.html << \\\\\\"EOF\\\\\\"\\\\n<!DOCTYPE html>...\\"...[truncated]"}'
                    ),
                    "llm_tool_call_raw_arguments_preview": (
                        '{"command":"cat > index.html << \\"EOF\\"\\\\n<!DOCTYPE html>..."}...[truncated]'
                    ),
                    "llm_tool_call_raw_arguments_preview_truncated": True,
                    "llm_tool_call_parse_error": (
                        "Unexpected system error: Invalid response from stream: "
                        "failed to parse streamed tool-call arguments for id=tool_bad name=replace."
                    ),
                },
            )
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(content="Recovered and sending corrected tool call.")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {"content": ""}
        return {"content": "Recovered and sending corrected tool call."}


@pytest.mark.asyncio
async def test_interaction_loop_recovers_after_stream_tool_call_format_error():
    stored_messages = []
    session = _FakeSession(stored_messages)
    tool_executor = _FakeToolExecutor()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_ErrorOnlyLLMHandler(),
        tool_executor=tool_executor,
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert not any(isinstance(event, ErrorEvent) for event in events)
    tool_call_events = [event for event in events if isinstance(event, ToolCallEvent)]
    tool_output_events = [
        event for event in events if isinstance(event, ToolOutputEvent)
    ]
    assert tool_call_events
    assert tool_output_events
    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert tool_executor.execute_called is False
    assert (
        session.history.assistant_messages[-1][0]
        == "Recovered and sending corrected tool call."
    )
    assert session.history.tool_outputs
    assert (
        "malformed tool-call arguments from model"
        in session.history.tool_outputs[-1][0]
    )
    fallback_call = tool_call_events[0]
    assert fallback_call.metadata is not None
    assert fallback_call.metadata["llm_tool_call_validation_failed"] is True
    assert fallback_call.metadata["skip_local_execution"] is True
    assert fallback_call.metadata["llm_tool_call_raw_tool_call_preview"].startswith(
        '{"id":"tool_bad","name":"replace","arguments":"'
    )
    assert "index.html" in fallback_call.metadata["llm_tool_call_raw_arguments_preview"]
    assert (
        fallback_call.metadata["llm_tool_call_raw_arguments_preview_truncated"] is True
    )
    assert (
        "failed to parse streamed tool-call arguments"
        in fallback_call.metadata["llm_tool_call_parse_error"]
    )
    assert fallback_call.parameters == {}
    fallback_output = tool_output_events[0]
    assert fallback_output.metadata is not None
    assert fallback_output.metadata["llm_tool_call_validation_failed"] is True
    assert (
        "retry_guidance: retry the same tool with smaller argument payload chunks."
        in fallback_output.output
    )
    assert "target_file: index.html" in fallback_output.output


class _FatalErrorOnlyLLMHandler:
    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        yield ErrorEvent(
            content="Unexpected system error: dependency initialization failed"
        )
        yield FullResponseEvent(content="")

    def get_last_response_payload(self):
        return {"content": ""}


class _NativeMouseControlMissingActionLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        self.calls += 1
        if self.calls == 1:
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(content="Final answer after failed tool call.")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_mouse_1",
                        "name": "mouse_control",
                        "arguments": {"x": 10, "y": 20},
                    }
                ],
            }
        return {"content": "Final answer after failed tool call."}


class _NativeBrowserMissingActionLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        self.calls += 1
        if self.calls == 1:
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(
            content="Final answer after metadata allowlist rejection."
        )

    def get_last_response_payload(self):
        if self.calls == 1:
            return {
                "content": "",
                "tool_calls": [
                    {
                        "id": "call_browser_invalid_1",
                        "name": "browser",
                        "arguments": {},
                    }
                ],
            }
        return {"content": "Final answer after metadata allowlist rejection."}


class _NativeToolCallWithoutIdLLMHandler:
    def __init__(self):
        self.calls = 0

    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        self.calls += 1
        if self.calls == 1:
            yield FullResponseEvent(content="")
            return
        yield FullResponseEvent(content="Final answer after fallback id tool call.")

    def get_last_response_payload(self):
        if self.calls == 1:
            return {
                "content": "",
                "tool_calls": [
                    {
                        "name": "mouse_control",
                        "arguments": {"x": 10, "y": 20},
                    }
                ],
            }
        return {"content": "Final answer after fallback id tool call."}


@pytest.mark.asyncio
async def test_interaction_loop_stops_after_nonrecoverable_stream_error_event():
    stored_messages = []
    session = _FakeSession(stored_messages)
    tool_executor = _FakeToolExecutor()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_FatalErrorOnlyLLMHandler(),
        tool_executor=tool_executor,
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    error_events = [event for event in events if isinstance(event, ErrorEvent)]
    assert len(error_events) == 1
    assert error_events[0].content == INTERNAL_SERVER_ERROR_MESSAGE
    assert not any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert not any(isinstance(event, ToolOutputEvent) for event in events)
    assert tool_executor.execute_called is False
    assert (
        session.history.assistant_messages[-1][0]
        == f"[System Error: {INTERNAL_SERVER_ERROR_MESSAGE}]"
    )


@pytest.mark.asyncio
async def test_interaction_loop_replays_invalid_direct_mouse_tool_call():
    session = _FakeSession(stored_messages=[])
    tool_executor = _CapturingToolExecutor()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_NativeMouseControlMissingActionLLMHandler(),
        tool_executor=tool_executor,
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert tool_executor.execute_called is True
    assert tool_executor.executed_tool_names == ["mouse_control"]
    assert tool_executor.executed_parameters == [
        {"x": 10, "y": 20},
    ]
    assert session.history.assistant_messages[0][1] == [
        {
            "id": "call_mouse_1",
            "name": "mouse_control",
            "arguments": {"x": 10, "y": 20},
        }
    ]
    assert session.history.staged_tool_call_ids[0] == (["call_mouse_1"], False)
    assert (
        session.history.assistant_messages[-1][0]
        == "Final answer after failed tool call."
    )


@pytest.mark.asyncio
async def test_interaction_loop_replays_invalid_direct_browser_tool_call():
    session = _FakeSession(stored_messages=[])
    tool_executor = _CapturingToolExecutor()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_NativeBrowserMissingActionLLMHandler(),
        tool_executor=tool_executor,
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert tool_executor.execute_called is True
    assert tool_executor.executed_tool_names == ["browser"]
    assert tool_executor.executed_parameters == [{}]
    assert session.history.assistant_messages[0][1] == [
        {
            "id": "call_browser_invalid_1",
            "name": "browser",
            "arguments": {},
        }
    ]
    assert session.history.staged_tool_call_ids[0] == (
        ["call_browser_invalid_1"],
        False,
    )
    assert session.history.assistant_messages[-1][0] == (
        "Final answer after metadata allowlist rejection."
    )


@pytest.mark.asyncio
async def test_interaction_loop_stages_fallback_tool_call_id_written_to_history():
    session = _FakeSession(stored_messages=[])
    tool_executor = _CapturingToolExecutor()
    loop = InteractionLoop(
        session=session,
        prompt_coordinator=_FakePromptCoordinator(),
        llm_handler=_NativeToolCallWithoutIdLLMHandler(),
        tool_executor=tool_executor,
        event_presenter=_FakeEventPresenter(),
    )

    events = [event async for event in loop.run_loop()]

    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert tool_executor.execute_called is True
    assert session.history.assistant_messages[0][1] == [
        {
            "id": "tool_call_0",
            "name": "mouse_control",
            "arguments": {"x": 10, "y": 20},
        }
    ]
    assert session.history.staged_tool_call_ids[0] == (["tool_call_0"], False)
    assert session.history.assistant_messages[-1][0] == (
        "Final answer after fallback id tool call."
    )
