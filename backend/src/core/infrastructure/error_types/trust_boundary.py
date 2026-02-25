"""Trust-boundary/security exception types."""

from typing import Any, Dict, List, Optional

from backend.src.core.infrastructure.error_types.base import (
    BaseAppError,
    _merge_trust_boundary_metadata,
)


class _TrustBoundaryError(BaseAppError):
    """Base trust-boundary error with shared metadata/attribute wiring."""

    def __init__(
        self,
        message: str,
        error_code: str,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
        **fields: Any,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            metadata=_merge_trust_boundary_metadata(metadata, boundary_name, **fields),
            cause=cause,
        )
        self.boundary_name = boundary_name

    def _init_with_single_field(
        self,
        message: str,
        error_code: str,
        boundary_name: Optional[str],
        metadata: Optional[Dict[str, Any]],
        cause: Optional[Exception],
        field_name: str,
        field_value: Any,
    ) -> None:
        """Initialize trust-boundary error with one additional optional metadata field."""
        _TrustBoundaryError.__init__(
            self,
            message=message,
            error_code=error_code,
            boundary_name=boundary_name,
            metadata=metadata,
            cause=cause,
            **{field_name: field_value},
        )


class InputSizeLimitError(_TrustBoundaryError):
    """Raised when input exceeds size limits in trust boundaries."""

    def __init__(
        self,
        message: str,
        actual_size: Optional[int] = None,
        max_size: Optional[int] = None,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="INPUT_SIZE_LIMIT_ERROR",
            boundary_name=boundary_name,
            metadata=metadata,
            cause=cause,
            actual_size=actual_size,
            max_size=max_size,
        )
        self.actual_size = actual_size
        self.max_size = max_size


class ParseTimeoutError(_TrustBoundaryError):
    """Raised when parsing exceeds timeout in trust boundaries."""

    def __init__(
        self,
        message: str,
        timeout_seconds: Optional[float] = None,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        self._init_with_single_field(
            message=message,
            error_code="PARSE_TIMEOUT_ERROR",
            boundary_name=boundary_name,
            metadata=metadata,
            cause=cause,
            field_name="timeout_seconds",
            field_value=timeout_seconds,
        )
        self.timeout_seconds = timeout_seconds


class ParseValidationError(_TrustBoundaryError):
    """Raised when parsed data fails validation in trust boundaries."""

    def __init__(
        self,
        message: str,
        validation_errors: Optional[List[str]] = None,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        self._init_with_single_field(
            message=message,
            error_code="PARSE_VALIDATION_ERROR",
            boundary_name=boundary_name,
            metadata=metadata,
            cause=cause,
            field_name="validation_errors",
            field_value=validation_errors,
        )
        self.validation_errors = validation_errors or []
