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


def test_format_for_history_preformatted_prefers_llm_content():
    result = ToolResult(
        success=True,
        llm_content="<xml />",
        metadata={"is_preformatted": True},
    )

    assert result.format_for_history("click") == "<xml />"


def test_format_for_history_non_preformatted_uses_data_and_error():
    result = ToolResult(success=False, error="bad")
    assert result.format_for_history("click") == "Error: bad"

    result = ToolResult(success=True, data={"output": "ok"})
    assert result.format_for_history("type") == "ok"

    result = ToolResult(success=True)
    assert result.format_for_history("scroll") == "Tool scroll executed"
