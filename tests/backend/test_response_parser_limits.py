import pytest

from backend.src.core.config.models import AppConfig, SecurityLimits
from backend.src.core.infrastructure.exceptions import InputSizeLimitError, ParseValidationError
from backend.src.llm.parser import ResponseParser
from backend.src.tools.categorization import ToolDomain


class DummyTool:
    def __init__(self, name, category=ToolDomain.FILESYSTEM):
        self.name = name
        self.category = category
        self.description = name


class DummyRegistry:
    def __init__(self, tools):
        self._tools = {tool.name: tool for tool in tools}

    def get_tool_names(self):
        return list(self._tools.keys())

    def get_tool(self, name):
        return self._tools.get(name)


def _make_parser(limits):
    return ResponseParser(
        config=AppConfig(security_limits=limits),
        tool_registry=DummyRegistry([DummyTool("read_file")]),
    )


@pytest.mark.asyncio
async def test_parse_rejects_too_many_tool_calls():
    limits = SecurityLimits(max_tool_calls_per_response=1)
    parser = _make_parser(limits)

    response = (
        '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/a"}}}\n'
        '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/b"}}}'
    )

    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_rejects_large_json():
    limits = SecurityLimits(max_json_size=10)
    parser = _make_parser(limits)

    response = '{"functionCall":{"name":"read_file","args":{}}}'

    with pytest.raises(InputSizeLimitError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_rejects_parameter_count():
    limits = SecurityLimits(max_parameter_count=1)
    parser = _make_parser(limits)

    response = '{"functionCall":{"name":"read_file","args":{"a":1,"b":2}}}'

    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_rejects_nested_json_depth():
    limits = SecurityLimits(max_json_nesting_depth=1)
    parser = _make_parser(limits)

    response = '{"functionCall":{"name":"read_file","args":{"nested":{"x":1}}}}'

    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)
