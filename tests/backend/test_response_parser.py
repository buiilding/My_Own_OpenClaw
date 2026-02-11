import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser import ParsedToolCall, ResponseParser
from backend.src.tools.categorization import ToolDomain


class DummyTool:
    def __init__(self, name, category):
        self.name = name
        self.category = category
        self.description = f"{name} tool"


class DummyRegistry:
    def __init__(self, tools):
        self._tools = {tool.name: tool for tool in tools}

    def get_tool_names(self):
        return list(self._tools.keys())

    def get_tool(self, name):
        return self._tools.get(name)


def _make_parser(tools, limits=None):
    config = AppConfig(
        interaction_mode="agent",
        security_limits=limits or SecurityLimits(),
    )
    return ResponseParser(config=config, tool_registry=DummyRegistry(tools))


@pytest.mark.asyncio
async def test_parse_response_pure_json_tool_call():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    response = '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/x"}}}'
    parsed = await parser.parse_response(response)
    assert parsed.has_tool_calls is True
    assert parsed.text_content == ""
    assert parsed.tool_calls[0].tool_name == "read_file"
    assert parsed.tool_calls[0].parameters["file_path"] == "/tmp/x"


@pytest.mark.asyncio
async def test_parse_response_embedded_json_multiple_calls():
    parser = _make_parser(
        [
            DummyTool("read_file", ToolDomain.FILESYSTEM),
            DummyTool("replace", ToolDomain.FILESYSTEM),
        ]
    )
    response = (
        "first\n"
        '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/a"}}}\n'
        "middle\n"
        '{"functionCall":{"name":"replace","args":{"file_path":"/tmp/b","old_string":"x","new_string":"y"}}}\n'
        "last"
    )
    parsed = await parser.parse_response(response)
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 2
    assert parsed.tool_calls[0].tool_name == "read_file"
    assert parsed.tool_calls[1].tool_name == "replace"
    assert "functionCall" not in parsed.text_content


@pytest.mark.asyncio
async def test_parse_response_requires_metadata_for_computer_use_tools():
    parser = _make_parser([DummyTool("mouse_control", ToolDomain.COMPUTER)])
    response = '{"functionCall":{"name":"mouse_control","args":{"action":"click","x":1,"y":2}}}'
    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_accepts_computer_use_metadata_wrapper():
    parser = _make_parser([DummyTool("mouse_control", ToolDomain.COMPUTER)])
    response = (
        '{"metadata":{"description":"screen","explanation":"click","expectation":"dialog"},'
        '"action":{"functionCall":{"name":"mouse_control","args":{"action":"click","x":1,"y":2}}}}'
    )
    parsed = await parser.parse_response(response)
    assert len(parsed.tool_calls) == 1
    tool_call: ParsedToolCall = parsed.tool_calls[0]
    assert tool_call.metadata["description"] == "screen"
    assert tool_call.parameters["action"] == "click"


@pytest.mark.asyncio
async def test_parse_response_accepts_metadata_wrapper_any_order():
    parser = _make_parser([DummyTool("mouse_control", ToolDomain.COMPUTER)])
    response = (
        '{"action":{"functionCall":{"name":"mouse_control","args":{"action":"click","x":1,"y":2}}},'
        '"metadata":{"description":"screen","explanation":"click","expectation":"dialog"}}'
    )
    parsed = await parser.parse_response(response)
    assert len(parsed.tool_calls) == 1
    tool_call: ParsedToolCall = parsed.tool_calls[0]
    assert tool_call.metadata["description"] == "screen"
    assert tool_call.parameters["action"] == "click"


@pytest.mark.asyncio
async def test_parse_response_rejects_unknown_tool():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    response = '{"functionCall":{"name":"unknown_tool","args":{}}}'
    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_rejects_large_parameter_values():
    limits = SecurityLimits(max_parameter_value_size=5)
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)], limits=limits)
    response = '{"functionCall":{"name":"read_file","args":{"file_path":"too-long"}}}'
    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_recreates_executor_after_shutdown():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    parser.shutdown()

    response = '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/x"}}}'
    parsed = await parser.parse_response(response)

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "read_file"


def test_parse_sync_skips_redundant_second_pass_text_removal(monkeypatch):
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    response = '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/x"}}}'
    remove_calls_invocations = {"count": 0}
    original_remove = parser._extractor.remove_extracted_calls

    def spy_remove(text, tool_calls):
        remove_calls_invocations["count"] += 1
        return original_remove(text, tool_calls)

    monkeypatch.setattr(parser._extractor, "remove_extracted_calls", spy_remove)

    parsed = parser._parse_sync(response)

    assert parsed.has_tool_calls is True
    assert parsed.text_content == ""
    assert remove_calls_invocations["count"] == 0
