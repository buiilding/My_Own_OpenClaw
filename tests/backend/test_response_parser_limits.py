import pytest

from backend.src.core.config.models import SecurityLimits
from backend.src.core.infrastructure.exceptions import InputSizeLimitError, ParseValidationError
from tests.backend.response_parser_test_utils import DummyTool, make_response_parser


def _make_parser(limits):
    return make_response_parser([DummyTool("read_file", description="read_file")], limits=limits)


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
