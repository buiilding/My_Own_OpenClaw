"""Unit tests for extracted LLM provider utility modules."""

from types import SimpleNamespace

from backend.src.llm.providers.error_mapping import (
    build_api_error_message,
    extract_status_code,
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
