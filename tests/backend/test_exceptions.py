"""Tests for custom exception hierarchy."""
import pytest

from backend.src.core.infrastructure.exceptions import (
    BaseAppError,
    ConfigurationError,
    LLMError,
    LLMAPIError,
    LLMRateLimitError,
    ToolExecutionError,
    ToolValidationError,
    ToolNotFoundError,
    MemoryError,
    MemoryStoreError,
    EmbeddingError,
    SessionError,
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


class TestConfigurationError:
    """Tests for ConfigurationError."""

    def test_init(self):
        error = ConfigurationError("Invalid config")
        
        assert error.message == "Invalid config"
        assert error.error_code == "CONFIG_ERROR"
        assert error.config_key is None

    def test_init_with_config_key(self):
        error = ConfigurationError("Invalid value", config_key="database.host")
        
        assert error.config_key == "database.host"
        assert error.metadata["config_key"] == "database.host"


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


class TestToolExecutionError:
    """Tests for ToolExecutionError."""

    def test_init(self):
        error = ToolExecutionError("Tool failed")
        
        assert error.message == "Tool failed"
        assert error.error_code == "TOOL_EXECUTION_ERROR"
        assert error.tool_name is None

    def test_init_with_tool_name(self):
        error = ToolExecutionError("Failed", tool_name="read_file")
        
        assert error.tool_name == "read_file"
        assert error.metadata["tool_name"] == "read_file"


class TestToolValidationError:
    """Tests for ToolValidationError."""

    def test_init(self):
        error = ToolValidationError("Invalid params")
        
        assert error.message == "Invalid params"
        assert error.error_code == "TOOL_VALIDATION_ERROR"
        assert error.validation_errors == []

    def test_init_with_validation_errors(self):
        errors = ["Missing required field", "Invalid type"]
        error = ToolValidationError("Invalid", validation_errors=errors)
        
        assert error.validation_errors == errors
        assert error.metadata["validation_errors"] == errors


class TestToolNotFoundError:
    """Tests for ToolNotFoundError."""

    def test_init(self):
        error = ToolNotFoundError("unknown_tool")
        
        assert error.tool_name == "unknown_tool"
        assert "unknown_tool" in error.message
        assert error.error_code == "TOOL_NOT_FOUND"


class TestMemoryError:
    """Tests for MemoryError."""

    def test_init(self):
        error = MemoryError("Memory operation failed")
        
        assert error.message == "Memory operation failed"
        assert error.error_code == "MEMORY_ERROR"

    def test_init_with_user_id(self):
        error = MemoryError("Failed", user_id="user123")
        
        assert error.user_id == "user123"


class TestMemoryStoreError:
    """Tests for MemoryStoreError."""

    def test_init(self):
        error = MemoryStoreError("Store failed")
        
        assert error.error_code == "MEMORY_STORE_ERROR"

    def test_init_with_operation(self):
        error = MemoryStoreError("Failed", operation="insert")
        
        assert error.operation == "insert"


class TestEmbeddingError:
    """Tests for EmbeddingError."""

    def test_init(self):
        error = EmbeddingError("Embedding failed")
        
        assert error.error_code == "EMBEDDING_ERROR"


class TestSessionError:
    """Tests for SessionError."""

    def test_init(self):
        error = SessionError("Session error")
        
        assert error.error_code == "SESSION_ERROR"
        assert error.session_id is None
        assert error.user_id is None

    def test_init_with_ids(self):
        error = SessionError("Failed", session_id="sess123", user_id="user456")
        
        assert error.session_id == "sess123"
        assert error.user_id == "user456"


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

    def test_tool_errors_inherit_from_tool_execution_error(self):
        validation = ToolValidationError("Invalid")
        not_found = ToolNotFoundError("tool")
        
        assert isinstance(validation, ToolExecutionError)
        assert isinstance(not_found, ToolExecutionError)

    def test_memory_errors_inherit_from_memory_error(self):
        store_error = MemoryStoreError("Failed")
        embedding = EmbeddingError("Failed")
        
        assert isinstance(store_error, MemoryError)
        assert isinstance(embedding, MemoryError)

    def test_all_inherit_from_base_app_error(self):
        errors = [
            ConfigurationError("Test"),
            LLMError("Test"),
            ToolExecutionError("Test"),
            MemoryError("Test"),
            SessionError("Test"),
            InputSizeLimitError("Test"),
            ParseTimeoutError("Test"),
            ParseValidationError("Test"),
        ]
        
        for error in errors:
            assert isinstance(error, BaseAppError), f"{type(error).__name__} should inherit from BaseAppError"
