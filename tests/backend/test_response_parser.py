import pytest

from backend.src.core.config.models import SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseValidationError
from backend.src.llm.parser import ParsedToolCall
from backend.src.llm.parser_types import ToolCallSchema
from backend.src.tools.categorization import ToolDomain
from tests.backend.response_parser_test_utils import DummyTool, make_response_parser


def _make_parser(tools, limits=None, schema=None):
    return make_response_parser(tools, limits=limits, schema=schema)


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
async def test_parse_response_maps_unified_system_use_to_concrete_tool():
    parser = _make_parser([DummyTool("system_use", ToolDomain.SYSTEM)])
    response = (
        '{"functionCall":{"name":"system_use","args":{"tool":"run_shell_command",'
        '"explanation":"verify shell","arguments":{"command":"echo hi","run_in_background":false}}}}'
    )

    parsed = await parser.parse_response(response)
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    assert parsed.tool_calls[0].tool_name == "run_shell_command"
    assert parsed.tool_calls[0].parameters == {
        "command": "echo hi",
        "run_in_background": False,
        "explanation": "verify shell",
    }


@pytest.mark.asyncio
async def test_parse_response_system_use_supports_nested_explanation_fallback():
    parser = _make_parser([DummyTool("system_use", ToolDomain.SYSTEM)])
    response = (
        '{"functionCall":{"name":"system_use","args":{"tool":"run_shell_command",'
        '"arguments":{"command":"echo hi","run_in_background":false,"explanation":"legacy nested"}}}}'
    )

    parsed = await parser.parse_response(response)
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    assert parsed.tool_calls[0].tool_name == "run_shell_command"
    assert parsed.tool_calls[0].parameters["explanation"] == "legacy nested"


@pytest.mark.asyncio
async def test_parse_response_system_use_prefers_top_level_explanation_over_nested_fallback():
    parser = _make_parser([DummyTool("system_use", ToolDomain.SYSTEM)])
    response = (
        '{"functionCall":{"name":"system_use","args":{"tool":"run_shell_command",'
        '"explanation":"canonical top-level",'
        '"arguments":{"command":"echo hi","run_in_background":false,"explanation":"legacy nested"}}}}'
    )

    parsed = await parser.parse_response(response)
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    assert parsed.tool_calls[0].tool_name == "run_shell_command"
    assert parsed.tool_calls[0].parameters["explanation"] == "canonical top-level"


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
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    )
    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


@pytest.mark.asyncio
@pytest.mark.parametrize("missing_field", ["description", "explanation", "expectation"])
async def test_parse_response_rejects_direct_computer_use_missing_required_metadata_field(
    missing_field,
):
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    metadata = {
        "description": "screen",
        "explanation": "click",
        "expectation": "dialog",
    }
    metadata.pop(missing_field)
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        f'"metadata":{metadata!r},'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    ).replace("'", '"')

    with pytest.raises(
        ParseValidationError,
        match=f"missing required metadata field '{missing_field}'",
    ):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_accepts_direct_computer_use_metadata():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        '"metadata":{"description":"screen","explanation":"click","expectation":"dialog"},'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    )
    parsed = await parser.parse_response(response)
    assert len(parsed.tool_calls) == 1
    tool_call: ParsedToolCall = parsed.tool_calls[0]
    assert tool_call.metadata["description"] == "screen"
    assert tool_call.tool_name == "mouse_control"
    assert tool_call.parameters["action"] == "click"


@pytest.mark.asyncio
async def test_parse_response_trims_direct_computer_use_metadata_fields():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        '"metadata":{"description":" screen ","explanation":" click ","expectation":" dialog "},'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    )

    parsed = await parser.parse_response(response)
    tool_call: ParsedToolCall = parsed.tool_calls[0]
    assert tool_call.metadata == {
        "description": "screen",
        "explanation": "click",
        "expectation": "dialog",
    }


@pytest.mark.asyncio
async def test_parse_response_accepts_direct_legacy_mouse_tool_when_only_computer_use_is_registered():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"mouse_control","args":{'
        '"action":"click","x":2,"y":3,'
        '"metadata":{"description":"screen","explanation":"click button","expectation":"dialog opens"}'
        '}}}'
    )

    parsed = await parser.parse_response(response)
    assert len(parsed.tool_calls) == 1
    tool_call: ParsedToolCall = parsed.tool_calls[0]
    assert tool_call.tool_name == "mouse_control"
    assert tool_call.parameters == {"action": "click", "x": 2, "y": 3}
    assert tool_call.metadata == {
        "description": "screen",
        "explanation": "click button",
        "expectation": "dialog opens",
    }


@pytest.mark.asyncio
async def test_parse_response_rejects_direct_legacy_mouse_tool_without_metadata():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"mouse_control","args":{"action":"click","x":2,"y":3}}}'
    )

    with pytest.raises(ParseValidationError, match="missing metadata"):
        await parser.parse_response(response)


@pytest.mark.asyncio
@pytest.mark.parametrize("missing_field", ["description", "explanation", "expectation"])
async def test_parse_response_rejects_direct_legacy_mouse_tool_missing_required_metadata_field(
    missing_field,
):
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    metadata = {
        "description": "screen",
        "explanation": "click button",
        "expectation": "dialog opens",
    }
    metadata.pop(missing_field)
    response = (
        '{"functionCall":{"name":"mouse_control","args":{'
        '"action":"click","x":2,"y":3,'
        f'"metadata":{metadata!r}'
        '}}}'
    ).replace("'", '"')

    with pytest.raises(
        ParseValidationError,
        match=f"missing required metadata field '{missing_field}'",
    ):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_rejects_direct_computer_use_whitespace_only_metadata_fields():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        '"metadata":{"description":"   ","explanation":"\\n","expectation":"\\t"},'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    )

    with pytest.raises(ParseValidationError, match="missing required metadata field"):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_rejects_direct_computer_use_unexpected_metadata_fields():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control",'
        '"metadata":{"description":"screen","explanation":"click","expectation":"dialog","trace_id":"abc-123"},'
        '"arguments":{"action":"click","x":1,"y":2}}}}'
    )

    with pytest.raises(ParseValidationError, match="unexpected metadata fields"):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_rejects_direct_legacy_mouse_tool_unexpected_metadata_fields():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"functionCall":{"name":"mouse_control","args":{'
        '"action":"click","x":2,"y":3,'
        '"metadata":{"description":"screen","explanation":"click button","expectation":"dialog opens","trace_id":"abc-123"}'
        '}}}'
    )

    with pytest.raises(ParseValidationError, match="unexpected metadata fields"):
        await parser.parse_response(response)


@pytest.mark.asyncio
async def test_parse_response_rejects_legacy_computer_use_metadata_wrapper():
    parser = _make_parser([DummyTool("computer_use", ToolDomain.COMPUTER)])
    response = (
        '{"metadata":{"description":"screen","explanation":"click","expectation":"dialog"},'
        '"action":{"functionCall":{"name":"mouse_control","args":{"action":"click","x":1,"y":2}}}}'
    )

    with pytest.raises(ParseValidationError):
        await parser.parse_response(response)


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


@pytest.mark.asyncio
async def test_parse_response_plain_text_fast_path_skips_executor_creation():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    assert parser._executor is None

    parsed = await parser.parse_response("hello from assistant")

    assert parsed.has_tool_calls is False
    assert parsed.tool_calls == []
    assert parsed.text_content == "hello from assistant"
    assert parser._executor is None


@pytest.mark.asyncio
async def test_parse_response_non_tool_json_fast_path_skips_executor_creation():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    assert parser._executor is None

    parsed = await parser.parse_response('{"status":"ok","count":2}')

    assert parsed.has_tool_calls is False
    assert parsed.tool_calls == []
    assert parsed.text_content == '{"status":"ok","count":2}'
    assert parser._executor is None


@pytest.mark.asyncio
async def test_parse_response_respects_custom_schema_root_key():
    parser = _make_parser(
        [DummyTool("read_file", ToolDomain.FILESYSTEM)],
        schema=ToolCallSchema(root_key="tool"),
    )

    parsed = await parser.parse_response(
        '{"tool":{"name":"read_file","args":{"file_path":"/tmp/custom"}}}'
    )

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "read_file"
    assert parsed.tool_calls[0].parameters["file_path"] == "/tmp/custom"


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


def test_parse_sync_skips_pure_json_strategy_for_embedded_response():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    response = (
        "prefix text\n"
        '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/x"}}}\n'
        "suffix text"
    )

    strategy_calls = {"json": 0, "embedded": 0}
    original_embedded = parser._extractor.parse_embedded_json

    def fail_json(*_args, **_kwargs):
        strategy_calls["json"] += 1
        raise AssertionError("parse_json_response should be skipped for embedded responses")

    def spy_embedded(*args, **kwargs):
        strategy_calls["embedded"] += 1
        return original_embedded(*args, **kwargs)

    parser._parsing_strategies = (fail_json, spy_embedded)
    parsed = parser._parse_sync(response)

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "read_file"
    assert "functionCall" not in parsed.text_content
    assert strategy_calls["json"] == 0
    assert strategy_calls["embedded"] == 1


def test_parse_sync_keeps_pure_json_strategy_for_object_wrapped_response():
    parser = _make_parser([DummyTool("read_file", ToolDomain.FILESYSTEM)])
    response = '{"functionCall":{"name":"read_file","args":{"file_path":"/tmp/x"}}}'

    strategy_calls = {"json": 0}
    original_json = parser._extractor.parse_json_response

    def spy_json(*args, **kwargs):
        strategy_calls["json"] += 1
        return original_json(*args, **kwargs)

    parser._parsing_strategies = (spy_json, parser._extractor.parse_embedded_json)
    parsed = parser._parse_sync(response)

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "read_file"
    assert strategy_calls["json"] == 1
