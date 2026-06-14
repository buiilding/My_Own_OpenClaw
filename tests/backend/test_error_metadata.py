"""Covers error metadata behavior in the backend test suite."""

from backend.src.core.infrastructure.error_types import (
    InputSizeLimitError,
    LLMAPIError,
    LLMRateLimitError,
    ParseTimeoutError,
)


def test_llm_api_error_metadata_preserves_zero_status_code() -> None:
    error = LLMAPIError("provider failed", status_code=0)

    assert error.status_code == 0
    assert error.metadata["status_code"] == 0


def test_llm_rate_limit_metadata_preserves_zero_retry_after() -> None:
    error = LLMRateLimitError(retry_after=0)

    assert error.retry_after == 0
    assert error.metadata["retry_after"] == 0


def test_input_size_limit_metadata_preserves_zero_sizes() -> None:
    error = InputSizeLimitError("too large", actual_size=0, max_size=0)

    assert error.actual_size == 0
    assert error.max_size == 0
    assert error.metadata["actual_size"] == 0
    assert error.metadata["max_size"] == 0


def test_parse_timeout_metadata_preserves_zero_timeout() -> None:
    error = ParseTimeoutError("timed out", timeout_seconds=0)

    assert error.timeout_seconds == 0
    assert error.metadata["timeout_seconds"] == 0
