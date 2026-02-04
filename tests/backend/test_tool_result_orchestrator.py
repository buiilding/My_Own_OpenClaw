import pytest
from types import SimpleNamespace

from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.orchestrator import ToolResultOrchestrator


class DummyRegistry:
    def __init__(self):
        self.context_factory = object()
        self._capabilities = {
            "foo": {"name": "foo"},
            "bar": {"name": "bar"},
        }

    def get_tool_names(self):
        return ["foo", "bar"]

    def get_tool_capabilities(self, tool_name):
        return self._capabilities.get(tool_name)


class DummySession:
    pass


@pytest.mark.asyncio
async def test_execute_tools_from_response_requires_session_ref():
    orchestrator = ToolResultOrchestrator(DummyRegistry(), config={})
    response = ParsedResponse(
        original_response="",
        tool_calls=[],
        text_content="",
        has_tool_calls=False,
    )

    result = await orchestrator.execute_tools_from_response(response, session_ref=None)

    assert result.tool_results == []


@pytest.mark.asyncio
async def test_execute_tools_from_response_bundle_missing_id_returns_empty():
    orchestrator = ToolResultOrchestrator(DummyRegistry(), config={})
    tool_calls = [
        ParsedToolCall(
            tool_name="tool-a",
            parameters={},
            raw_call="{}",
            metadata={"bundle_id": None},
        ),
        ParsedToolCall(
            tool_name="tool-b",
            parameters={},
            raw_call="{}",
            metadata={"bundle_id": None},
        ),
    ]
    response = ParsedResponse(
        original_response="{}",
        tool_calls=tool_calls,
        text_content="",
        has_tool_calls=True,
    )

    result = await orchestrator.execute_tools_from_response(
        response, session_ref=DummySession()
    )

    assert result.tool_results == []


@pytest.mark.asyncio
async def test_execute_tools_from_response_calls_execute_single_tool(monkeypatch):
    orchestrator = ToolResultOrchestrator(DummyRegistry(), config={})
    tool_calls = [
        ParsedToolCall(
            tool_name="tool-a",
            parameters={},
            raw_call="{}",
            metadata={"request_id": "req-1"},
        ),
        ParsedToolCall(
            tool_name="tool-b",
            parameters={},
            raw_call="{}",
            metadata={"request_id": "req-2"},
        ),
    ]
    response = ParsedResponse(
        original_response="{}",
        tool_calls=tool_calls,
        text_content="",
        has_tool_calls=True,
    )

    async def fake_execute_single_tool(tool_call, session_ref):
        return SimpleNamespace(tool_call=tool_call, result="ok", success=True)

    monkeypatch.setattr(
        "backend.src.tools.orchestrator.execute_single_tool",
        fake_execute_single_tool,
    )

    result = await orchestrator.execute_tools_from_response(
        response, session_ref=DummySession()
    )

    assert len(result.tool_results) == 2
    assert result.tool_results[0].tool_call is tool_calls[0]
    assert result.tool_results[1].tool_call is tool_calls[1]


def test_get_available_tools_returns_capabilities():
    orchestrator = ToolResultOrchestrator(DummyRegistry(), config={})

    tools = orchestrator.get_available_tools()

    assert tools == [{"name": "foo"}, {"name": "bar"}]
