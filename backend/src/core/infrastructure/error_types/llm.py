"""LLM-related exception types."""

from typing import Any, Dict, Optional

from backend.src.core.infrastructure.error_types.base import (
    BaseAppError,
    _init_optional_scoped_context_error,
    _init_scoped_context_error,
)


class LLMError(BaseAppError):
    """Base exception for all LLM-related errors."""

    default_error_code = "LLM_ERROR"

    def __init__(
        self,
        message: str,
        model: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
        error_code: Optional[str] = None,
    ):
        _init_scoped_context_error(
            self,
            scope_name="model",
            scope_value=model,
            message=message,
            default_error_code=self.default_error_code,
            error_code=error_code,
            metadata=metadata,
            cause=cause,
        )

    def _init_optional_field(
        self,
        message: str,
        model: Optional[str],
        metadata: Optional[Dict[str, Any]],
        cause: Optional[Exception],
        field_name: str,
        field_value: Any,
    ) -> None:
        """Initialize an LLM-derived error that adds one optional metadata field."""
        _init_optional_scoped_context_error(
            self,
            init_method=LLMError.__init__,
            scope_name="model",
            scope_value=model,
            message=message,
            metadata=metadata,
            cause=cause,
            field_name=field_name,
            field_value=field_value,
            default_error_code=self.default_error_code,
        )


class _LLMOptionalFieldError(LLMError):
    """Base LLM error with one optional metadata field mirrored to an attribute."""

    optional_field_name: str = ""

    def __init__(
        self,
        message: str,
        model: Optional[str] = None,
        field_value: Any = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        self._init_optional_field(
            message=message,
            model=model,
            metadata=metadata,
            cause=cause,
            field_name=self.optional_field_name,
            field_value=field_value,
        )
        setattr(self, self.optional_field_name, field_value)


class LLMAPIError(_LLMOptionalFieldError):
    """Raised for general LLM API errors."""

    default_error_code = "LLM_API_ERROR"
    optional_field_name = "status_code"

    def __init__(
        self,
        message: str,
        model: Optional[str] = None,
        status_code: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            model=model,
            field_value=status_code,
            metadata=metadata,
            cause=cause,
        )


class LLMRateLimitError(_LLMOptionalFieldError):
    """Raised when an LLM API rate limit is exceeded."""

    default_error_code = "LLM_RATE_LIMIT"
    optional_field_name = "retry_after"

    def __init__(
        self,
        message: str = "LLM rate limit exceeded. Please wait a moment and try again.",
        model: Optional[str] = None,
        retry_after: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            model=model,
            field_value=retry_after,
            metadata=metadata,
            cause=cause,
        )
