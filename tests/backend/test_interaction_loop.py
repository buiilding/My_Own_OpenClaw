"""Tests for InteractionLoop fallback behavior."""

from __future__ import annotations

import pytest

from backend.src.agent.execution.interaction_loop import InteractionLoop
from backend.src.core.events.streaming_events import (
    AssistantMessageFullEvent,
    ErrorEvent,
    FullResponseEvent,
    StreamingCompleteEvent,
    ToolCallEvent,
    ToolOutputEvent,
)
from backend.src.core.messages.structures import StoredMessage
from backend.src.core.types.enums import MessageRole, MessageType


class _FakeConfig:
    max_agent_iterations = 3


class _FakeHistory:
    def __init__(self, stored_messages):
        self._stored_messages = list(stored_messages)
        self.assistant_messages = []
        self.tool_outputs = []
        self.staged_tool_call_ids = []

    def add_assistant_message(self, message, tool_calls=None):
        self.assistant_messages.append((message, tool_calls))

    def stage_tool_call_ids(self, tool_call_ids, consume_all_on_next_output=False):
        self.staged_tool_call_ids.append((list(tool_call_ids), consume_all_on_next_output))

    def add_tool_output(self, message, image_data=None):
        self.tool_outputs.append((message, image_data))

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


class _FakeEventPresenter:
    async def present_prompt_metadata(self, metadata):
        if False:
            yield None

    async def present_assistant_message(self, content):
        yield AssistantMessageFullEvent(content=content)

    async def present_completion(self, final_response):
        yield StreamingCompleteEvent(final_response=final_response)

    async def present_error(self, error_message):
        if False:
            yield None


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
                    "failed to parse streamed tool-call arguments for id=tool_bad name=replace"
                )
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

    assert any(isinstance(event, ErrorEvent) for event in events)
    assert any(isinstance(event, ToolCallEvent) for event in events)
    assert any(isinstance(event, ToolOutputEvent) for event in events)
    assert any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert tool_executor.execute_called is False
    assert session.history.assistant_messages[-1][0] == "Recovered and sending corrected tool call."
    assert session.history.tool_outputs
    assert "malformed tool-call arguments from model" in session.history.tool_outputs[-1][0]


class _FatalErrorOnlyLLMHandler:
    async def get_response(
        self,
        prompt,
        tools=None,
        tool_choice=None,
        parallel_tool_calls=None,
    ):
        _ = (prompt, tools, tool_choice, parallel_tool_calls)
        yield ErrorEvent(content="Unexpected system error: dependency initialization failed")
        yield FullResponseEvent(content="")

    def get_last_response_payload(self):
        return {"content": ""}


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

    assert any(isinstance(event, ErrorEvent) for event in events)
    assert not any(isinstance(event, StreamingCompleteEvent) for event in events)
    assert not any(isinstance(event, ToolOutputEvent) for event in events)
    assert tool_executor.execute_called is False
    assert session.history.assistant_messages[-1][0].startswith("[System Error:")
