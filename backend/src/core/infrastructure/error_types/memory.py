"""Memory and embedding exception types."""

from typing import Any, Dict, Optional

from backend.src.core.infrastructure.error_types.base import (
    BaseAppError,
    _init_optional_scoped_context_error,
    _init_scoped_context_error,
)


class MemoryError(BaseAppError):
    """Base exception for memory-related errors."""

    default_error_code = "MEMORY_ERROR"

    def __init__(
        self,
        message: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
        error_code: Optional[str] = None,
    ):
        _init_scoped_context_error(
            self,
            scope_name="user_id",
            scope_value=user_id,
            message=message,
            default_error_code=self.default_error_code,
            error_code=error_code,
            metadata=metadata,
            cause=cause,
        )

    def _init_optional_field(
        self,
        message: str,
        user_id: Optional[str],
        metadata: Optional[Dict[str, Any]],
        cause: Optional[Exception],
        field_name: str,
        field_value: Any,
    ) -> None:
        """Initialize a memory-derived error that adds one optional metadata field."""
        _init_optional_scoped_context_error(
            self,
            init_method=MemoryError.__init__,
            scope_name="user_id",
            scope_value=user_id,
            message=message,
            metadata=metadata,
            cause=cause,
            field_name=field_name,
            field_value=field_value,
            default_error_code=self.default_error_code,
        )


class MemoryStoreError(MemoryError):
    """Raised when memory storage operations fail."""

    default_error_code = "MEMORY_STORE_ERROR"

    def __init__(
        self,
        message: str,
        user_id: Optional[str] = None,
        operation: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        self._init_optional_field(
            message=message,
            user_id=user_id,
            metadata=metadata,
            cause=cause,
            field_name="operation",
            field_value=operation,
        )
        self.operation = operation


class EmbeddingError(MemoryError):
    """Raised when embedding generation fails."""

    default_error_code = "EMBEDDING_ERROR"
