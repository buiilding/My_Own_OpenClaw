from backend.src.api.services.rehydrate_tool_call_normalization import (
    extract_thought_signature,
    extract_tool_call_details,
    normalize_optional_string,
    normalize_tool_calls,
)


def test_extract_tool_call_details_reads_function_arguments_and_thought_signature():
    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content='{"function":{"name":"browser","id":"call-1","arguments":"{\\"action\\":\\"snapshot\\"}","thought_signature":"sig-1"}}',
        fallback_tool_name="fallback",
    )

    assert tool_name == "browser"
    assert arguments == {"action": "snapshot"}
    assert tool_call_id == "call-1"
    assert thought_signature == "sig-1"


def test_extract_tool_call_details_reads_top_level_arguments_alias():
    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content='{"name":"replace","arguments":{"path":"/tmp/a.txt"}}',
        fallback_tool_name="fallback",
    )

    assert tool_name == "replace"
    assert arguments == {"path": "/tmp/a.txt"}
    assert tool_call_id is None
    assert thought_signature is None


def test_extract_tool_call_details_falls_back_for_invalid_content():
    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content="not-json",
        fallback_tool_name=None,
    )

    assert tool_name == "unknown_tool"
    assert arguments == {}
    assert tool_call_id is None
    assert thought_signature is None

    tool_name, arguments, tool_call_id, thought_signature = extract_tool_call_details(
        content='["not", "a", "dict"]',
        fallback_tool_name="fallback_tool",
    )

    assert tool_name == "fallback_tool"
    assert arguments == {}
    assert tool_call_id is None
    assert thought_signature is None


def test_normalize_tool_calls_skips_invalid_entries_and_preserves_alias_signature():
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


def test_normalize_optional_string_trims_and_rejects_empty():
    assert normalize_optional_string("  value ") == "value"
    assert normalize_optional_string("   ") is None
    assert normalize_optional_string(None) is None
