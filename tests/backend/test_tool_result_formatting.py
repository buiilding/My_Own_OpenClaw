"""Covers tool result formatting behavior in the backend test suite."""

from backend.src.core.interfaces.tool import ToolResult


def test_from_payload_defaults_success_and_data():
    result = ToolResult.from_payload({"output": "ok"})

    assert result.success is True
    assert result.data is None
    assert result.output == "ok"


def test_from_payload_error_sets_success_false_and_output():
    result = ToolResult.from_payload({"error": "boom"})

    assert result.success is False
    assert result.output == "Error: boom"


def test_from_payload_null_error_defaults_success_true():
    result = ToolResult.from_payload({"error": None, "data": {"output": "ok"}})

    assert result.success is True
    assert result.error is None
    assert result.output == "ok"


def test_from_payload_screenshot_only_generates_generic_message():
    result = ToolResult.from_payload({"data": {"screenshot": "shot"}})

    assert result.output == "Tool executed successfully"


def test_format_for_history_prefers_output():
    result = ToolResult(success=True, output="<xml />")

    assert result.format_for_history("click") == "<xml />"


def test_format_for_history_uses_data_and_error_fallbacks():
    result = ToolResult(success=False, error="bad")
    assert result.format_for_history("click") == "Error: bad"

    result = ToolResult(success=True, data={"output": "ok"})
    assert result.format_for_history("type") == "ok"

    result = ToolResult(success=True)
    assert result.format_for_history("scroll") == "Tool scroll executed"


def test_from_payload_respects_explicit_success_flag_even_with_error():
    result = ToolResult.from_payload({"success": True, "error": "boom"})

    assert result.success is True
    assert result.output == "Error: boom"


def test_from_payload_preserves_explicit_output():
    result = ToolResult.from_payload(
        {
            "success": True,
            "output": "preformatted",
            "data": {"output": "ignored"},
        }
    )

    assert result.output == "preformatted"


def test_from_payload_uses_message_field_when_output_missing():
    result = ToolResult.from_payload({"data": {"message": "hello"}})

    assert result.output == "hello"


def test_from_payload_dict_data_without_known_output_fields_stringifies():
    result = ToolResult.from_payload({"data": {"foo": "bar"}})

    assert result.output == "{'foo': 'bar'}"


def test_from_payload_non_dict_data_stringifies():
    result = ToolResult.from_payload({"data": 123})

    assert result.output == "123"


def test_from_payload_with_only_standard_fields_keeps_data_none():
    result = ToolResult.from_payload({"metadata": {"trace": "x"}})

    assert result.success is True
    assert result.data is None
    assert result.output is None


def test_format_for_history_dict_without_output_fields_returns_dict_string():
    result = ToolResult(success=True, data={"foo": "bar"})

    assert result.format_for_history("read_file") == "{'foo': 'bar'}"


def test_format_for_history_non_dict_data_stringifies():
    result = ToolResult(success=True, data=42)

    assert result.format_for_history("read_file") == "42"
