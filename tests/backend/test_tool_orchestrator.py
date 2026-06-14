"""Covers tool orchestrator behavior in the backend test suite."""

from types import SimpleNamespace

import pytest

from backend.src.agent.tools.orchestrator import ToolOrchestrator
from backend.src.core.events.streaming_events import ThinkingEvent, ToolCallEvent
from backend.src.llm.parser_types import ParsedResponse, ParsedToolCall


class _FakeToolSender:
    async def send_tools(self, tool_calls, session):
        assert len(tool_calls) == 1
        assert session == "session-ref"
        yield ToolCallEvent(
            tool_name=tool_calls[0].tool_name,
            parameters=tool_calls[0].parameters,
            request_id="req-1",
        )


class _UnusedToolResultOrchestrator:
    async def execute_tools_from_response(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("process_results is not part of this test")


class _UnusedToolProcessingCoordinator:
    async def process(self, *args, **kwargs):  # pragma: no cover
        raise AssertionError("process_results is not part of this test")


class _RecordingToolResultOrchestrator:
    def __init__(self):
        self.calls = []
        self.result = object()

    async def execute_tools_from_response(self, parsed_response, **kwargs):
        self.calls.append((parsed_response, kwargs))
        return self.result


class _RecordingToolProcessingCoordinator:
    def __init__(self):
        self.calls = []

    async def process(self, orchestration_result, session):
        self.calls.append((orchestration_result, session))


@pytest.mark.asyncio
async def test_execute_does_not_emit_synthetic_thinking_event():
    orchestrator = ToolOrchestrator(
        tool_sender=_FakeToolSender(),
        tool_result_orchestrator=_UnusedToolResultOrchestrator(),
        tool_processing_coordinator=_UnusedToolProcessingCoordinator(),
    )
    parsed_response = ParsedResponse(
        original_response="tool call payload",
        tool_calls=[
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"action": "click", "x": 10, "y": 20},
            )
        ],
        text_content="",
        has_tool_calls=True,
    )

    events = [event async for event in orchestrator.execute(parsed_response, "session-ref")]

    assert len(events) == 1
    assert all(not isinstance(event, ThinkingEvent) for event in events)
    assert isinstance(events[0], ToolCallEvent)
    assert events[0].tool_name == "mouse_control"


@pytest.mark.asyncio
async def test_process_results_waits_then_processes_with_session_identity():
    result_orchestrator = _RecordingToolResultOrchestrator()
    processing_coordinator = _RecordingToolProcessingCoordinator()
    orchestrator = ToolOrchestrator(
        tool_sender=_FakeToolSender(),
        tool_result_orchestrator=result_orchestrator,
        tool_processing_coordinator=processing_coordinator,
    )
    parsed_response = ParsedResponse(
        original_response="tool call payload",
        tool_calls=[
            ParsedToolCall(
                tool_name="mouse_control",
                parameters={"action": "click", "x": 10, "y": 20},
            )
        ],
        text_content="",
        has_tool_calls=True,
    )
    session = SimpleNamespace(user_id="user-1", session_id="session-1")

    await orchestrator.process_results(parsed_response, session)

    assert result_orchestrator.calls == [
        (
            parsed_response,
            {
                "user_id": "user-1",
                "session_id": "session-1",
                "session_ref": session,
            },
        )
    ]
    assert processing_coordinator.calls == [
        (result_orchestrator.result, session)
    ]
