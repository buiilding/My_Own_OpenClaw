"""Tests for execution tool-call bridge helpers."""

from backend.src.agent.execution.tool_call_bridge import (
    build_recoverable_tool_output_message,
    extract_raw_arguments_preview_from_error,
    extract_tool_call_parse_error_from_error,
    extract_tool_call_id_from_error,
    extract_tool_call_ids,
    extract_tool_name_from_error,
    is_recoverable_llm_tool_call_error,
    to_history_tool_calls,
    to_parsed_response,
)
from backend.src.llm.parser_types import ParsedToolCall


def test_to_parsed_response_normalizes_native_tool_calls():
    parsed = to_parsed_response(
        {
            "content": "assistant text",
            "tool_calls": [
                {
                    "id": "call_123",
                    "name": "replace",
                    "arguments": {"path": "README.md", "metadata": {"source": "llm"}},
                }
            ],
        }
    )

    assert parsed.text_content == "assistant text"
    assert parsed.has_tool_calls is True
    assert len(parsed.tool_calls) == 1
    assert parsed.tool_calls[0].tool_name == "replace"
    assert parsed.tool_calls[0].parameters["path"] == "README.md"
    assert parsed.tool_calls[0].metadata == {"tool_call_id": "call_123", "source": "llm"}


def test_to_parsed_response_handles_invalid_native_payload_fields():
    parsed = to_parsed_response(
        {
            "content": "",
            "tool_calls": [{"id": "", "name": " ", "arguments": "not-a-dict"}],
        }
    )

    assert parsed.has_tool_calls is True
    assert parsed.tool_calls[0].tool_name == "unknown_tool"
    assert parsed.tool_calls[0].parameters == {}
    assert parsed.tool_calls[0].metadata is None


def test_to_history_tool_calls_preserves_ids_with_fallback():
    history_calls = to_history_tool_calls(
        [
            ParsedToolCall(
                tool_name="first",
                parameters={"x": 1},
                metadata={"tool_call_id": "id_1"},
            ),
            ParsedToolCall(
                tool_name="second",
                parameters={"y": 2},
                metadata=None,
            ),
        ]
    )

    assert history_calls == [
        {"id": "id_1", "name": "first", "arguments": {"x": 1}},
        {"id": "tool_call_1", "name": "second", "arguments": {"y": 2}},
    ]


def test_extract_tool_call_ids_ignores_missing_or_invalid_values():
    ids = extract_tool_call_ids(
        [
            ParsedToolCall(tool_name="a", parameters={}, metadata={"tool_call_id": "ok_1"}),
            ParsedToolCall(tool_name="b", parameters={}, metadata={"tool_call_id": ""}),
            ParsedToolCall(tool_name="c", parameters={}, metadata={"tool_call_id": 123}),
            ParsedToolCall(tool_name="d", parameters={}, metadata=None),
            ParsedToolCall(tool_name="e", parameters={}, metadata={"tool_call_id": "ok_2"}),
        ]
    )

    assert ids == ["ok_1", "ok_2"]


def test_recoverable_error_detection_and_message_formatting():
    error_msg = (
        "Invalid response from stream: failed to parse streamed tool-call arguments "
        "for id=call_bad name=replace"
    )

    assert is_recoverable_llm_tool_call_error(error_msg) is True
    assert extract_tool_call_id_from_error(error_msg) == "call_bad"
    assert extract_tool_name_from_error(error_msg) == "replace"

    formatted = build_recoverable_tool_output_message(
        "replace",
        error_msg,
        raw_arguments_preview='{"file_path":"/tmp/demo.txt","new_string":"..."}',
    )
    assert formatted.startswith("replace output:")
    assert "malformed tool-call arguments from model" in formatted
    assert "retry_guidance: retry the same tool with smaller argument payload chunks." in formatted
    assert "target_file: /tmp/demo.txt" in formatted
    assert "status: failed" in formatted


def test_extract_raw_arguments_preview_and_parse_error_summary():
    error_msg = (
        "Unexpected system error: [LLM_API_ERROR] Invalid response from stream: "
        "failed to parse streamed tool-call arguments for id=tool_bad name=run_shell_command. "
        "Raw arguments preview: '{\"command\":\"cat > index.html << \\\"EOF\\\"\\\\n<!DOCTYPE html>...\"...[truncated]'"
    )

    preview = extract_raw_arguments_preview_from_error(error_msg)
    summary = extract_tool_call_parse_error_from_error(error_msg)

    assert preview.startswith("{\"command\"")
    assert preview.endswith("...[truncated]")
    assert "failed to parse streamed tool-call arguments" in summary
    assert "Raw arguments preview" not in summary
