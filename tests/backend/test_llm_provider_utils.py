"""Unit tests for extracted LLM provider utility modules."""

from types import SimpleNamespace

import pytest

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.providers.error_mapping import (
    build_api_error_message,
    extract_status_code,
    iter_exception_chain,
)
from backend.src.llm.providers.message_normalization import (
    normalize_messages_for_provider,
    normalize_tools_for_litellm,
)
from backend.src.llm.providers.response_parsing import (
    extract_delta_content,
    extract_completion_response,
    normalize_raw_tool_calls,
    normalize_tool_arguments,
)
from backend.src.llm.providers.usage_diagnostics import (
    build_stream_cache_diagnostics,
    collect_usage_payload,
    extract_usage_int,
    normalize_usage_payload,
)


class _ModelDumpPayload:
    def model_dump(self):
        return {"prompt_tokens": 12}


class _ModelDumpWithWarningsPayload:
    def __init__(self):
        self.called_with = None

    def model_dump(self, **kwargs):
        self.called_with = kwargs
        return {"prompt_tokens": 18}


class _ToolArgumentsModelDumpWithWarnings:
    def __init__(self):
        self.called_with = None

    def model_dump(self, **kwargs):
        self.called_with = kwargs
        return {"path": "/tmp/demo.txt"}


class _ToolArgumentsModelDumpNoKwargs:
    def model_dump(self):
        return {"path": "/tmp/no-kwargs.txt"}


class _ToolArgumentsDictFallback:
    def model_dump(self, **_kwargs):
        raise RuntimeError("model_dump unavailable")

    def dict(self):
        return {"path": "/tmp/dict-fallback.txt"}


class _UsageDictBackedObject:
    def __init__(self):
        self.prompt_tokens = 21
        self.cached_tokens = 5


def test_extract_status_code_supports_direct_response_and_exception_chain():
    direct = RuntimeError("boom")
    direct.status_code = 429
    assert extract_status_code(direct) == 429

    wrapped = RuntimeError("outer")
    wrapped.response = SimpleNamespace(status_code=503)
    assert extract_status_code(wrapped) == 503

    nested_inner = RuntimeError("server error 520")
    nested_outer = RuntimeError("wrapper")
    nested_outer.__cause__ = nested_inner
    assert extract_status_code(nested_outer) == 520


def test_extract_status_code_supports_context_chain_and_regex_patterns():
    context_inner = RuntimeError("status code 418")
    context_outer = RuntimeError("wrapper")
    context_outer.__context__ = context_inner
    assert extract_status_code(context_outer) == 418

    regex_error = RuntimeError("Provider returned error code 429 after retry")
    assert extract_status_code(regex_error) == 429


def test_iter_exception_chain_stops_on_cycles():
    first = RuntimeError("first")
    second = RuntimeError("second")
    first.__cause__ = second
    second.__cause__ = first

    chain = list(iter_exception_chain(first))
    assert len(chain) == 2
    assert chain[0] is first
    assert chain[1] is second


def test_build_api_error_message_formats_520_and_generic_paths():
    assert "HTTP 520" in build_api_error_message("Provider", 520)
    assert build_api_error_message("Provider", 500) == "Provider API error (HTTP 500)"
    assert build_api_error_message("Provider", None) == "Provider API error"


def test_normalize_usage_payload_supports_model_dump_and_collect_usage_payload():
    normalized = normalize_usage_payload(_ModelDumpPayload())
    assert normalized == {"prompt_tokens": 12}

    warning_safe_payload = _ModelDumpWithWarningsPayload()
    warning_safe = normalize_usage_payload(warning_safe_payload)
    assert warning_safe == {"prompt_tokens": 18}
    assert warning_safe_payload.called_with == {"warnings": False}

    payload = collect_usage_payload(
        SimpleNamespace(model_extra={"usage": {"prompt_tokens": 9}})
    )
    assert payload == {"prompt_tokens": 9}


def test_normalize_usage_payload_returns_none_for_non_mapping_like_values():
    assert normalize_usage_payload(123) is None
    assert normalize_usage_payload("usage") is None


def test_extract_usage_int_coerces_numeric_strings_and_integer_floats():
    usage = {"usage_metadata": {"prompt_token_count": "44"}, "float_value": 12.0}
    assert extract_usage_int(usage, [("usage_metadata", "prompt_token_count")]) == 44
    assert extract_usage_int(usage, [("float_value",)]) == 12


def test_extract_usage_int_ignores_bool_and_non_integral_float_values():
    usage = {"bool_value": True, "float_value": 12.5}
    assert extract_usage_int(usage, [("bool_value",)]) is None
    assert extract_usage_int(usage, [("float_value",)]) is None


def test_build_stream_cache_diagnostics_returns_unknown_hit_and_miss():
    unknown = build_stream_cache_diagnostics(model="m", usage=None)
    assert unknown["status"] == "unknown"
    assert unknown["reason"] == "provider_usage_unavailable"

    hit = build_stream_cache_diagnostics(
        model="m",
        usage={"prompt_tokens_details": {"cached_tokens": 5}},
    )
    assert hit["status"] == "hit"
    assert hit["cache_hit"] is True

    miss = build_stream_cache_diagnostics(
        model="m",
        usage={"prompt_tokens_details": {"cached_tokens": 0}},
    )
    assert miss["status"] == "miss"
    assert miss["cache_hit"] is False


def test_build_stream_cache_diagnostics_supports_usage_metadata_camel_case_paths():
    diagnostics = build_stream_cache_diagnostics(
        model="m",
        usage={
            "usageMetadata": {
                "cachedContentTokenCount": 9,
                "promptTokenCount": 40,
                "candidatesTokenCount": 12,
                "thoughtsTokenCount": 5,
                "totalTokenCount": 57,
            }
        },
    )
    assert diagnostics["status"] == "hit"
    assert diagnostics["cache_hit"] is True
    assert diagnostics["cached_tokens"] == 9
    assert diagnostics["prompt_tokens"] == 40
    assert diagnostics["completion_tokens"] == 12
    assert diagnostics["thinking_tokens"] == 5
    assert diagnostics["total_tokens"] == 57


def test_normalize_messages_for_provider_converts_internal_tool_calls_and_drops_orphans():
    messages = [
        {"role": "user", "content": "List files"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/demo.txt"}}],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
        {"role": "tool", "tool_call_id": "missing", "content": "orphan"},
    ]

    normalized = normalize_messages_for_provider(messages, model="m")
    assert len(normalized) == 3
    assert normalized[1]["tool_calls"][0]["type"] == "function"
    assert normalized[1]["tool_calls"][0]["function"]["arguments"] == "{\"path\":\"/tmp/demo.txt\"}"
    assert normalized[-1]["tool_call_id"] == "call_1"


def test_normalize_messages_for_provider_rejects_non_dict_message_entries():
    with pytest.raises(LLMAPIError, match="Invalid message at index 0"):
        normalize_messages_for_provider(["not-a-message"], model="m")


def test_normalize_messages_for_provider_returns_original_list_when_no_changes_needed():
    messages = [{"role": "user", "content": "hello"}]
    normalized = normalize_messages_for_provider(messages, model="m")
    assert normalized is messages


def test_normalize_messages_for_provider_returns_isolated_tool_calls_when_any_call_changes():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "read_file", "arguments": "{\"path\":\"/tmp/a\"}"},
                },
                {
                    "id": "call_2",
                    "type": "function",
                    "function": {"name": "replace", "arguments": {"path": "/tmp/b"}},
                },
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
        {"role": "tool", "tool_call_id": "call_2", "content": "ok"},
    ]

    normalized = normalize_messages_for_provider(messages, model="m")
    messages[0]["tool_calls"][0]["function"]["arguments"] = "{\"path\":\"/tmp/mutated\"}"

    assert normalized[0]["tool_calls"][0]["function"]["arguments"] == "{\"path\":\"/tmp/a\"}"
    assert normalized[0]["tool_calls"][1]["function"]["arguments"] == "{\"path\":\"/tmp/b\"}"


def test_normalize_tools_for_litellm_rejects_legacy_shape():
    with pytest.raises(LLMAPIError, match="field 'type' must be 'function'"):
        normalize_tools_for_litellm(
            [{"name": "read_file", "parameters": {"type": "object"}}],
            model="m",
        )


def test_normalize_usage_payload_supports_object_dict_fallback():
    normalized = normalize_usage_payload(_UsageDictBackedObject())
    assert normalized == {"prompt_tokens": 21, "cached_tokens": 5}


def test_collect_usage_payload_prefers_top_level_usage_before_model_extra():
    payload = SimpleNamespace(
        usage={"prompt_tokens": 8},
        model_extra={"usage": {"prompt_tokens": 99}},
    )
    collected = collect_usage_payload(payload)
    assert collected == {"prompt_tokens": 8}


def test_extract_completion_response_parses_and_dedupes_openai_and_tool_use_blocks():
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                finish_reason="tool_calls",
                message=SimpleNamespace(
                    content=[
                        {"type": "text", "text": "Running"},
                        {
                            "type": "tool_use",
                            "id": "call_1",
                            "name": "read_file",
                            "input": {"path": "/tmp/demo.txt"},
                        },
                    ],
                    tool_calls=[
                        SimpleNamespace(
                            id="call_1",
                            function=SimpleNamespace(
                                name="read_file",
                                arguments='{"path":"/tmp/demo.txt"}',
                            ),
                        )
                    ],
                ),
            )
        ]
    )

    normalized = extract_completion_response(
        response,
        model="m",
        invalid_response_message="Invalid response",
    )
    assert normalized["content"] == "Running"
    assert normalized["finish_reason"] == "tool_calls"
    assert normalized["tool_calls"] == [
        {"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/demo.txt"}}
    ]


def test_extract_completion_response_keeps_same_id_when_tool_names_differ():
    response = {
        "choices": [
            {
                "message": {
                    "content": "ok",
                    "tool_calls": [
                        {"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/a"}},
                        {"id": "call_1", "name": "replace", "arguments": {"path": "/tmp/b"}},
                    ],
                }
            }
        ]
    }

    normalized = extract_completion_response(
        response,
        model="m",
        invalid_response_message="Invalid response",
    )
    assert normalized["tool_calls"] == [
        {"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/a"}},
        {"id": "call_1", "name": "replace", "arguments": {"path": "/tmp/b"}},
    ]


def test_extract_completion_response_falls_back_to_choice_text_when_message_content_empty():
    response = {
        "choices": [
            {
                "text": "fallback text",
                "message": {"content": None},
            }
        ]
    }

    normalized = extract_completion_response(
        response,
        model="m",
        invalid_response_message="Invalid response",
    )

    assert normalized["content"] == "fallback text"


def test_extract_delta_content_suppresses_tool_use_only_blocks():
    delta = {
        "content": [
            {
                "type": "tool_use",
                "id": "call_1",
                "name": "read_file",
                "input": {"path": "/tmp/demo.txt"},
            }
        ]
    }
    assert extract_delta_content(delta) is None


def test_extract_delta_content_joins_text_blocks_and_ignores_tool_use():
    delta = {
        "content": [
            {"type": "text", "text": "Hello "},
            {"type": "tool_use", "name": "read_file", "input": {"path": "/tmp/a"}},
            {"text": "world"},
        ]
    }
    assert extract_delta_content(delta) == "Hello world"


def test_normalize_messages_for_provider_drops_tool_message_with_blank_tool_call_id():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {"id": "call_1", "name": "read_file", "arguments": {"path": "/tmp/demo.txt"}}
            ],
        },
        {"role": "tool", "tool_call_id": " ", "content": "invalid"},
        {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
    ]

    normalized = normalize_messages_for_provider(messages, model="m")
    assert len(normalized) == 2
    assert normalized[-1]["tool_call_id"] == "call_1"


def test_normalize_messages_for_provider_normalizes_openai_function_argument_shapes():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_dict",
                    "type": "function",
                    "function": {"name": "read_file", "arguments": {"path": "/tmp/demo.txt"}},
                },
                {
                    "id": "call_none",
                    "type": "function",
                    "function": {"name": "wait", "arguments": None},
                },
            ],
        },
        {"role": "tool", "tool_call_id": "call_dict", "content": "ok"},
        {"role": "tool", "tool_call_id": "call_none", "content": "ok"},
    ]

    normalized = normalize_messages_for_provider(messages, model="m")
    assistant_calls = normalized[0]["tool_calls"]
    assert assistant_calls[0]["function"]["arguments"] == "{\"path\":\"/tmp/demo.txt\"}"
    assert assistant_calls[1]["function"]["arguments"] == "{}"
    assert normalized[1]["tool_call_id"] == "call_dict"
    assert normalized[2]["tool_call_id"] == "call_none"


def test_normalize_messages_for_provider_rejects_non_list_assistant_tool_calls():
    messages = [
        {"role": "assistant", "content": "", "tool_calls": "invalid"},
    ]

    with pytest.raises(LLMAPIError, match="assistant\\.tool_calls"):
        normalize_messages_for_provider(messages, model="m")


def test_normalize_messages_for_provider_rejects_openai_function_arguments_wrong_type():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_bad",
                    "type": "function",
                    "function": {"name": "read_file", "arguments": 123},
                }
            ],
        }
    ]

    with pytest.raises(LLMAPIError, match="function\\.arguments must be string/object"):
        normalize_messages_for_provider(messages, model="m")


def test_normalize_messages_for_provider_rejects_internal_tool_call_non_object_arguments():
    messages = [
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {"id": "call_bad", "name": "read_file", "arguments": "not-an-object"},
            ],
        }
    ]

    with pytest.raises(LLMAPIError, match="arguments must be object"):
        normalize_messages_for_provider(messages, model="m")


def test_normalize_tool_arguments_rejects_non_object_json():
    with pytest.raises(LLMAPIError, match="must decode to object"):
        normalize_tool_arguments(
            "[1,2,3]",
            model="m",
            invalid_response_message="Invalid response",
        )


def test_normalize_tool_arguments_prefers_warning_safe_model_dump():
    payload = _ToolArgumentsModelDumpWithWarnings()

    normalized = normalize_tool_arguments(
        payload,
        model="m",
        invalid_response_message="Invalid response",
    )

    assert normalized == {"path": "/tmp/demo.txt"}
    assert payload.called_with == {"warnings": False}


def test_normalize_tool_arguments_supports_model_dump_without_kwargs():
    payload = _ToolArgumentsModelDumpNoKwargs()

    normalized = normalize_tool_arguments(
        payload,
        model="m",
        invalid_response_message="Invalid response",
    )

    assert normalized == {"path": "/tmp/no-kwargs.txt"}


def test_normalize_tool_arguments_falls_back_to_dict_method():
    payload = _ToolArgumentsDictFallback()

    normalized = normalize_tool_arguments(
        payload,
        model="m",
        invalid_response_message="Invalid response",
    )

    assert normalized == {"path": "/tmp/dict-fallback.txt"}


def test_normalize_tool_arguments_rejects_unsupported_non_string_non_mapping_payload():
    with pytest.raises(LLMAPIError, match="unsupported tool arguments type list"):
        normalize_tool_arguments(
            [1, 2, 3],
            model="m",
            invalid_response_message="Invalid response",
        )


def test_normalize_raw_tool_calls_supports_tool_use_with_string_input():
    normalized = normalize_raw_tool_calls(
        [
            {
                "type": "tool_use",
                "name": "replace",
                "input": "{\"path\":\"/tmp/demo.txt\"}",
            }
        ],
        model="m",
        invalid_response_message="Invalid response",
    )

    assert normalized == [
        {
            "id": "tool_call_0",
            "name": "replace",
            "arguments": {"path": "/tmp/demo.txt"},
        }
    ]


def test_normalize_raw_tool_calls_rejects_invalid_container_shape():
    with pytest.raises(LLMAPIError, match="Invalid response"):
        normalize_raw_tool_calls(
            {"bad": "shape"},
            model="m",
            invalid_response_message="Invalid response",
        )


def test_normalize_raw_tool_calls_rejects_blank_tool_name():
    with pytest.raises(LLMAPIError, match="invalid tool name"):
        normalize_raw_tool_calls(
            [{"id": "call_1", "name": " ", "arguments": {}}],
            model="m",
            invalid_response_message="Invalid response",
        )


def test_normalize_tools_for_litellm_requires_parameters_object():
    with pytest.raises(LLMAPIError, match="function\\.parameters is required"):
        normalize_tools_for_litellm(
            [
                {
                    "type": "function",
                    "function": {"name": "read_file"},
                }
            ],
            model="m",
        )


def test_normalize_tools_for_litellm_requires_description_to_be_string_when_present():
    with pytest.raises(LLMAPIError, match="function\\.description must be a string"):
        normalize_tools_for_litellm(
            [
                {
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "description": 42,
                        "parameters": {"type": "object"},
                    },
                }
            ],
            model="m",
        )


def test_normalize_tools_for_litellm_returns_deep_copy():
    tools = [
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "parameters": {"type": "object", "properties": {"path": {"type": "string"}}},
            },
        }
    ]

    normalized = normalize_tools_for_litellm(tools, model="m")
    normalized[0]["function"]["parameters"]["properties"]["path"]["type"] = "number"

    assert tools[0]["function"]["parameters"]["properties"]["path"]["type"] == "string"
