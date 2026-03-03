from backend.src.core.messages.tool_call_thought_signature import (
    apply_tool_call_thought_signature,
    extract_tool_call_thought_signature,
)


def test_extract_tool_call_thought_signature_prefers_first_non_empty_source():
    value = extract_tool_call_thought_signature(
        {"thought_signature": "  "},
        {"thoughtSignature": "sig-123"},
        {"thought_signature": "sig-ignored"},
    )
    assert value == "sig-123"


def test_apply_tool_call_thought_signature_sets_call_and_function_fields():
    normalized_call = {"id": "call_1", "function": {"name": "browser"}}

    changed = apply_tool_call_thought_signature(
        normalized_call=normalized_call,
        thought_signature="sig-abc",
    )

    assert changed is True
    assert normalized_call["thought_signature"] == "sig-abc"
    assert normalized_call["function"]["thought_signature"] == "sig-abc"


def test_apply_tool_call_thought_signature_returns_false_when_already_set():
    normalized_call = {
        "id": "call_1",
        "thought_signature": "sig-abc",
        "function": {
            "name": "browser",
            "thought_signature": "sig-abc",
        },
    }

    changed = apply_tool_call_thought_signature(
        normalized_call=normalized_call,
        thought_signature="sig-abc",
    )

    assert changed is False
