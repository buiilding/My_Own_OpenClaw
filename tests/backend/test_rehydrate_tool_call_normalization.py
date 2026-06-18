"""Covers rehydrate tool call normalization behavior in the backend test suite."""

from backend.src.api.services.rehydrate_tool_call_normalization import (
    extract_thought_signature,
    normalize_tool_calls,
)


def test_normalize_tool_calls_skips_invalid_entries_and_preserves_camel_case_signature():
    normalized = normalize_tool_calls(
        [
            {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}},
            {
                "id": "call-2",
                "type": "function",
                "function": {
                    "name": "browser",
                    "arguments": '{"action":"snapshot"}',
                    "thoughtSignature": "sig-2",
                },
            },
            {
                "id": "call-3",
                "type": "function",
                "function": {"name": "  ", "arguments": "{bad-json"},
            },
            {"id": "", "name": "bad"},
            "not-a-dict",
        ]
    )

    assert normalized == [
        {"id": "call-1", "name": "read_file", "arguments": {"path": "/tmp/a.txt"}},
        {
            "id": "call-2",
            "name": "browser",
            "arguments": {"action": "snapshot"},
            "thought_signature": "sig-2",
        },
        {"id": "call-3", "name": "unknown_tool_2", "arguments": {}},
    ]


def test_extract_thought_signature_checks_multiple_sources():
    assert (
        extract_thought_signature(
            {"other": "value"},
            {"thoughtSignature": " sig-3 "},
        )
        == "sig-3"
    )
