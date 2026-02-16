from backend.src.core.interfaces.tool import ToolResult


def test_from_dict_defaults_success_and_data():
    result = ToolResult.from_dict({"output": "ok"})

    assert result.success is True
    assert result.data == {"output": "ok"}
    assert result.llm_content == "ok"
    assert result.return_display == "ok"


def test_from_dict_error_sets_success_false_and_llm_content():
    result = ToolResult.from_dict({"error": "boom"})

    assert result.success is False
    assert result.llm_content == "Error: boom"
    assert result.return_display == "Error: boom"


def test_from_dict_screenshot_only_generates_generic_message():
    result = ToolResult.from_dict({"data": {"screenshot": "shot"}})

    assert result.llm_content == "Tool executed successfully"
    assert result.return_display == "Tool executed successfully"


def test_format_for_history_prefers_llm_content_without_preformatted_flags():
    result = ToolResult(
        success=True,
        llm_content="<xml />",
    )

    assert result.format_for_history("click") == "<xml />"


def test_format_for_history_non_preformatted_uses_data_and_error():
    result = ToolResult(success=False, error="bad")
    assert result.format_for_history("click") == "Error: bad"

    result = ToolResult(success=True, data={"output": "ok"})
    assert result.format_for_history("type") == "ok"

    result = ToolResult(success=True)
    assert result.format_for_history("scroll") == "Tool scroll executed"


def test_from_dict_respects_explicit_success_flag_even_with_error():
    result = ToolResult.from_dict({"success": True, "error": "boom"})

    assert result.success is True
    assert result.llm_content == "Error: boom"
    assert result.return_display == "Error: boom"


def test_from_dict_preserves_explicit_llm_content_and_return_display():
    result = ToolResult.from_dict(
        {
            "success": True,
            "llm_content": "preformatted",
            "return_display": "display text",
            "data": {"output": "ignored for llm content"},
        }
    )

    assert result.llm_content == "preformatted"
    assert result.return_display == "display text"


def test_from_dict_uses_message_field_when_output_missing():
    result = ToolResult.from_dict({"data": {"message": "hello"}})

    assert result.llm_content == "hello"
    assert result.return_display == "hello"


def test_from_dict_uses_nested_llm_content_when_output_and_message_missing():
    result = ToolResult.from_dict({"data": {"llm_content": "nested"}})

    assert result.llm_content == "nested"
    assert result.return_display == "nested"


def test_from_dict_dict_data_without_known_output_fields_stringifies():
    result = ToolResult.from_dict({"data": {"foo": "bar"}})

    assert result.llm_content == "{'foo': 'bar'}"
    assert result.return_display == "{'foo': 'bar'}"


def test_from_dict_non_dict_data_stringifies():
    result = ToolResult.from_dict({"data": 123})

    assert result.llm_content == "123"
    assert result.return_display == "123"


def test_from_dict_with_only_standard_fields_keeps_data_none():
    result = ToolResult.from_dict({"metadata": {"trace": "x"}})

    assert result.success is True
    assert result.data is None
    assert result.return_display == "Tool executed successfully"


def test_format_for_history_dict_without_output_fields_returns_dict_string():
    result = ToolResult(success=True, data={"foo": "bar"})

    assert result.format_for_history("read_file") == "{'foo': 'bar'}"


def test_format_for_history_non_dict_data_stringifies():
    result = ToolResult(success=True, data=42)

    assert result.format_for_history("read_file") == "42"
