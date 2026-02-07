import time

import pytest

from backend.src.core.config.models import SecurityLimits
from backend.src.core.infrastructure.exceptions import ParseTimeoutError
from backend.src.llm.parser_extraction import JsonToolCallExtractor
from backend.src.llm.parser_types import ParsedToolCall


class DummySchema:
    def extract_tool_call(self, payload):
        function_call = payload.get("functionCall") if isinstance(payload, dict) else None
        if not isinstance(function_call, dict):
            return None
        return function_call.get("name"), function_call.get("args", {}), None


class DummyValidator:
    def validate_tool_call(self, _tool_name, _args):
        return None

    def validate_metadata(self, _tool_name, _metadata):
        return None


class DummyMetrics:
    def record_size_violation(self, *_args, **_kwargs):
        return None


def _make_extractor():
    return _make_extractor_with_limits(SecurityLimits())


def _make_extractor_with_limits(limits: SecurityLimits):
    return JsonToolCallExtractor(
        schema=DummySchema(),
        validator=DummyValidator(),
        metrics=DummyMetrics(),
        limits=limits,
    )


def test_safe_json_loads_raises_parse_timeout_error():
    extractor = _make_extractor()

    with pytest.raises(ParseTimeoutError):
        extractor._safe_json_loads(
            '{"functionCall":{"name":"read_file","args":{}}}',
            start_time=time.monotonic() - 10,
            timeout=1.0,
        )


def test_parse_embedded_json_extracts_multiple_calls():
    extractor = _make_extractor()
    response = (
        "before "
        '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
        " middle "
        '{"functionCall":{"name":"write_file","args":{"path":"/tmp/b"}}}'
        " after"
    )

    tool_calls, remaining_text = extractor.parse_embedded_json(
        response,
        start_time=time.monotonic(),
        timeout=1.0,
    )

    assert [call.tool_name for call in tool_calls] == ["read_file", "write_file"]
    assert "functionCall" not in remaining_text


def test_parse_embedded_json_normalizes_excess_blank_lines_after_removal():
    extractor = _make_extractor()
    response = (
        "line1\n\n\n\n"
        '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
        "\n\n\nline2"
    )

    tool_calls, remaining_text = extractor.parse_embedded_json(
        response,
        start_time=time.monotonic(),
        timeout=1.0,
    )

    assert len(tool_calls) == 1
    assert remaining_text == "line1\n\nline2"


def test_remove_extracted_by_positions_merges_overlapping_ranges():
    extractor = _make_extractor()
    text = "abc123456789xyz"
    cleaned = extractor._remove_extracted_by_positions(
        text,
        [(3, 9), (6, 12)],
    )

    assert cleaned == "abcxyz"


def test_remove_extracted_by_positions_single_range_fast_path():
    extractor = _make_extractor()
    text = "abc123xyz"

    cleaned = extractor._remove_extracted_by_positions(text, [(3, 6)])

    assert cleaned == "abcxyz"


def test_parse_embedded_json_honors_max_response_size_boundary():
    response = (
        "prefix "
        '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
        " suffix"
    )
    # Stop scanning before the JSON object starts.
    limits = SecurityLimits(max_response_size=6)
    extractor = _make_extractor_with_limits(limits)

    tool_calls, remaining_text = extractor.parse_embedded_json(
        response,
        start_time=time.monotonic(),
        timeout=1.0,
    )

    assert tool_calls == []
    assert remaining_text == response


def test_parse_embedded_json_accepts_small_json_with_large_trailing_text():
    response = (
        '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
        + ("x" * 400)
    )
    limits = SecurityLimits(max_json_size=120, max_response_size=600)
    extractor = _make_extractor_with_limits(limits)

    tool_calls, remaining_text = extractor.parse_embedded_json(
        response,
        start_time=time.monotonic(),
        timeout=1.0,
    )

    assert [call.tool_name for call in tool_calls] == ["read_file"]
    assert remaining_text == "x" * 400


def test_remove_extracted_calls_removes_repeated_identical_raw_calls():
    extractor = _make_extractor()
    raw_call = '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
    text = f"before {raw_call} middle {raw_call} after"
    tool_calls = [
        ParsedToolCall(tool_name="read_file", parameters={"path": "/tmp/a"}, raw_call=raw_call),
        ParsedToolCall(tool_name="read_file", parameters={"path": "/tmp/a"}, raw_call=raw_call),
    ]

    cleaned = extractor.remove_extracted_calls(text, tool_calls)

    assert cleaned == "before  middle  after"


def test_remove_extracted_calls_ignores_empty_raw_call_entries():
    extractor = _make_extractor()
    text = "  keep spacing  "
    tool_calls = [
        ParsedToolCall(
            tool_name="read_file",
            parameters={"path": "/tmp/a"},
            raw_call="",
        )
    ]

    cleaned = extractor.remove_extracted_calls(text, tool_calls)

    assert cleaned == text


def test_remove_extracted_calls_skips_empty_entries_and_removes_valid_calls():
    extractor = _make_extractor()
    raw_call = '{"functionCall":{"name":"read_file","args":{"path":"/tmp/a"}}}'
    text = f"before {raw_call} after"
    tool_calls = [
        ParsedToolCall(tool_name="read_file", parameters={"path": "/tmp/a"}, raw_call=""),
        ParsedToolCall(
            tool_name="read_file",
            parameters={"path": "/tmp/a"},
            raw_call=raw_call,
        ),
    ]

    cleaned = extractor.remove_extracted_calls(text, tool_calls)

    assert cleaned == "before  after"
