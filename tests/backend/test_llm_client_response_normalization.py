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


def test_normalize_response_payload_rejects_non_dict():
    with pytest.raises(LLMAPIError, match="Invalid response type"):
        normalize_response_payload("bad", model="model")


def test_normalize_response_payload_omits_optional_fields_when_absent():
    normalized = normalize_response_payload(
        {"content": "ok"},
        model="model",
    )

    assert normalized == {"content": "ok"}


def test_normalize_response_payload_preserves_finish_reason_none_when_key_present():
    normalized = normalize_response_payload(
        {"content": "ok", "finish_reason": None},
        model="model",
    )

    assert normalized == {"content": "ok", "finish_reason": None}


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


def test_normalize_tool_calls_defaults_missing_arguments_to_empty_dict():
    normalized = normalize_tool_calls(
        [{"id": "call_1", "name": "read_file"}],
        model="model",
    )

    assert normalized == [
        {"id": "call_1", "name": "read_file", "arguments": {}},
    ]


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

    with pytest.raises(LLMAPIError, match="Invalid tool call name"):
        normalize_tool_call_entry(
            {"id": "call_1", "name": "", "arguments": {}},
            index=0,
            model="model",
        )

    with pytest.raises(LLMAPIError, match="Invalid tool call id"):
        normalize_tool_call_entry(
            {"id": " ", "name": "read_file", "arguments": {}},
            index=0,
            model="model",
        )

    with pytest.raises(LLMAPIError, match="Invalid tool call name"):
        normalize_tool_call_entry(
            {"id": "call_1", "name": " ", "arguments": {}},
            index=0,
            model="model",
        )


def test_normalize_tool_call_entry_copies_argument_payload():
    arguments = {"path": "/tmp/demo.txt"}

    normalized = normalize_tool_call_entry(
        {"id": "call_1", "name": "read_file", "arguments": arguments},
        index=0,
        model="model",
    )

    arguments["path"] = "/tmp/mutated.txt"
    assert normalized["arguments"]["path"] == "/tmp/demo.txt"


def test_normalize_tool_call_entry_trims_tool_id_and_name():
    normalized = normalize_tool_call_entry(
        {"id": "  call_1  ", "name": "  read_file  ", "arguments": {}},
        index=0,
        model="model",
    )

    assert normalized["id"] == "call_1"
    assert normalized["name"] == "read_file"


def test_normalize_finish_reason_accepts_string_or_none_only():
    assert normalize_finish_reason(None, model="model") is None
    assert normalize_finish_reason("stop", model="model") == "stop"

    with pytest.raises(LLMAPIError, match="Invalid finish_reason type"):
        normalize_finish_reason(123, model="model")
