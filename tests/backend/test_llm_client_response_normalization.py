import pytest

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.client_response_normalization import (
    normalize_content,
    normalize_finish_reason,
    normalize_response_payload,
    normalize_tool_call_entry,
    normalize_tool_calls,
)


def test_normalize_response_payload_accepts_valid_contract():
    normalized = normalize_response_payload(
        {
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "name": "read_file",
                    "arguments": {"path": "/tmp/demo.txt"},
                }
            ],
            "finish_reason": "tool_calls",
        },
        model="model",
    )

    assert normalized["content"] == ""
    assert normalized["tool_calls"] == [
        {
            "id": "call_1",
            "name": "read_file",
            "arguments": {"path": "/tmp/demo.txt"},
        }
    ]
    assert normalized["finish_reason"] == "tool_calls"


def test_normalize_content_requires_string_or_none():
    with pytest.raises(LLMAPIError, match="missing 'content' key"):
        normalize_content({"no_content": True}, model="model")

    with pytest.raises(LLMAPIError, match="Invalid content type"):
        normalize_content({"content": 123}, model="model")

    assert normalize_content({"content": None}, model="model") == ""


def test_normalize_tool_calls_requires_list_shape():
    with pytest.raises(LLMAPIError, match="Invalid tool_calls type"):
        normalize_tool_calls({"bad": "value"}, model="model")

    assert normalize_tool_calls(None, model="model") is None


def test_normalize_tool_call_entry_validates_fields():
    with pytest.raises(LLMAPIError, match="Invalid tool call at index 0"):
        normalize_tool_call_entry(123, index=0, model="model")

    with pytest.raises(LLMAPIError, match="Invalid tool call id"):
        normalize_tool_call_entry(
            {"id": "", "name": "read_file", "arguments": {}},
            index=0,
            model="model",
        )

    with pytest.raises(LLMAPIError, match="Invalid tool call arguments"):
        normalize_tool_call_entry(
            {"id": "call_1", "name": "read_file", "arguments": "bad"},
            index=0,
            model="model",
        )


def test_normalize_finish_reason_accepts_string_or_none_only():
    assert normalize_finish_reason(None, model="model") is None
    assert normalize_finish_reason("stop", model="model") == "stop"

    with pytest.raises(LLMAPIError, match="Invalid finish_reason type"):
        normalize_finish_reason(123, model="model")
