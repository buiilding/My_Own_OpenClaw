"""Tests for custom exception hierarchy."""
import pytest

from backend.src.core.infrastructure.error_types.base import BaseAppError
from backend.src.core.infrastructure.error_types.llm import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)
from backend.src.core.infrastructure.error_types.trust_boundary import (
    InputSizeLimitError,
    ParseTimeoutError,
    ParseValidationError,
)


class TestBaseAppError:
    """Tests for BaseAppError."""

    def test_init_basic(self):
        error = BaseAppError("Something went wrong")
        
        assert error.message == "Something went wrong"
        assert error.error_code is None
        assert error.metadata == {}
        assert error.cause is None
        assert str(error) == "Something went wrong"

    def test_init_with_all_fields(self):
        cause = ValueError("Original error")
        error = BaseAppError(
            message="Something went wrong",
            error_code="ERR_001",
            metadata={"key": "value"},
            cause=cause
        )
        
        assert error.message == "Something went wrong"
        assert error.error_code == "ERR_001"
        assert error.metadata == {"key": "value"}
        assert error.cause is cause
        assert str(error) == "[ERR_001] Something went wrong"

    def test_repr(self):
        cause = ValueError("Original")
        error = BaseAppError(
            message="Test",
            error_code="ERR_001",
            metadata={"key": "value"},
            cause=cause
        )
        
        repr_str = repr(error)
        
        assert "BaseAppError" in repr_str
        assert "Test" in repr_str
        assert "ERR_001" in repr_str
        assert "key" in repr_str

    def test_inheritance(self):
        error = BaseAppError("Test")
        assert isinstance(error, Exception)


class TestLLMError:
    """Tests for LLMError."""

    def test_init(self):
        error = LLMError("LLM failed")
        
        assert error.message == "LLM failed"
        assert error.error_code == "LLM_ERROR"
        assert error.model is None

    def test_init_with_model(self):
        error = LLMError("Failed", model="gpt-4")
        
        assert error.model == "gpt-4"
        assert error.metadata["model"] == "gpt-4"


class TestLLMAPIError:
    """Tests for LLMAPIError."""

    def test_init(self):
        error = LLMAPIError("API error")
        
        assert error.message == "API error"
        assert error.error_code == "LLM_API_ERROR"
        assert error.status_code is None

    def test_init_with_status_code(self):
        error = LLMAPIError("Rate limited", status_code=429)
        
        assert error.status_code == 429
        assert error.metadata["status_code"] == 429


class TestLLMRateLimitError:
    """Tests for LLMRateLimitError."""

    def test_default_message(self):
        error = LLMRateLimitError()
        
        assert "rate limit" in error.message.lower()
        assert error.error_code == "LLM_RATE_LIMIT"

    def test_with_retry_after(self):
        error = LLMRateLimitError(retry_after=60)
        
        assert error.retry_after == 60
        assert error.metadata["retry_after"] == 60


class TestInputSizeLimitError:
    """Tests for InputSizeLimitError."""

    def test_init(self):
        error = InputSizeLimitError("Input too large")
        
        assert error.error_code == "INPUT_SIZE_LIMIT_ERROR"
        assert error.actual_size is None
        assert error.max_size is None

    def test_init_with_sizes(self):
        error = InputSizeLimitError(
            "Too large",
            actual_size=1000,
            max_size=500,
            boundary_name="trust_boundary"
        )
        
        assert error.actual_size == 1000
        assert error.max_size == 500
        assert error.boundary_name == "trust_boundary"


class TestParseTimeoutError:
    """Tests for ParseTimeoutError."""

    def test_init(self):
        error = ParseTimeoutError("Parse timed out")
        
        assert error.error_code == "PARSE_TIMEOUT_ERROR"

    def test_init_with_timeout(self):
        error = ParseTimeoutError(
            "Timed out",
            timeout_seconds=5.0,
            boundary_name="json_parse"
        )
        
        assert error.timeout_seconds == 5.0
        assert error.boundary_name == "json_parse"


class TestParseValidationError:
    """Tests for ParseValidationError."""

    def test_init(self):
        error = ParseValidationError("Validation failed")
        
        assert error.error_code == "PARSE_VALIDATION_ERROR"
        assert error.validation_errors == []

    def test_init_with_errors(self):
        errors = ["Field A is required", "Field B must be int"]
        error = ParseValidationError("Failed", validation_errors=errors)
        
        assert error.validation_errors == errors


class TestExceptionInheritance:
    """Tests for exception inheritance hierarchy."""

    def test_llm_errors_inherit_from_llm_error(self):
        api_error = LLMAPIError("API error")
        rate_limit = LLMRateLimitError()
        
        assert isinstance(api_error, LLMError)
        assert isinstance(rate_limit, LLMError)

    def test_all_inherit_from_base_app_error(self):
        errors = [
            LLMError("Test"),
            InputSizeLimitError("Test"),
            ParseTimeoutError("Test"),
            ParseValidationError("Test"),
        ]
        
        for error in errors:
            assert isinstance(error, BaseAppError), f"{type(error).__name__} should inherit from BaseAppError"
