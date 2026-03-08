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
