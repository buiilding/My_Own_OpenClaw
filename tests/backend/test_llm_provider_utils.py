"""Unit tests for extracted LLM provider utility modules."""

from types import SimpleNamespace

import pytest

from backend.src.core.infrastructure.exceptions import LLMAPIError
from backend.src.llm.providers.error_mapping import (
    build_api_error_message,
    extract_status_code,
)
from backend.src.llm.providers.message_normalization import (
    normalize_messages_for_provider,
    normalize_tools_for_litellm,
)
from backend.src.llm.providers.response_parsing import (
    extract_completion_response,
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


def test_extract_usage_int_coerces_numeric_strings_and_integer_floats():
    usage = {"usage_metadata": {"prompt_token_count": "44"}, "float_value": 12.0}
    assert extract_usage_int(usage, [("usage_metadata", "prompt_token_count")]) == 44
    assert extract_usage_int(usage, [("float_value",)]) == 12


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


def test_normalize_tools_for_litellm_rejects_legacy_shape():
    with pytest.raises(LLMAPIError, match="field 'type' must be 'function'"):
        normalize_tools_for_litellm(
            [{"name": "read_file", "parameters": {"type": "object"}}],
            model="m",
        )


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
