"""Shared base exception types and metadata helpers."""

from typing import Any, Dict, Optional


def _merge_metadata_if(
    metadata: Optional[Dict[str, Any]],
    include: bool,
    **extra: Any,
) -> Optional[Dict[str, Any]]:
    """Merge additional metadata fields only when the caller condition is met."""
    if not include:
        return metadata
    return {**(metadata or {}), **extra}


def _metadata_with_optional_field(
    metadata: Optional[Dict[str, Any]],
    field_name: str,
    field_value: Any,
) -> Optional[Dict[str, Any]]:
    """Attach one optional metadata field using existing truthy semantics."""
    return _merge_metadata_if(metadata, bool(field_value), **{field_name: field_value})


def _merge_trust_boundary_metadata(
    metadata: Optional[Dict[str, Any]],
    boundary_name: Optional[str],
    **fields: Any,
) -> Optional[Dict[str, Any]]:
    """Attach trust-boundary metadata with existing include rules."""
    return _merge_metadata_if(
        metadata,
        bool(boundary_name or any(fields.values())),
        boundary_name=boundary_name,
        **fields,
    )


class BaseAppError(Exception):
    """
    Base exception for all application errors.

    Provides consistent error handling with optional error codes,
    metadata, and user-friendly messages.
    """

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        """
        Initialize the base application error.

        Args:
            message: Human-readable error message
            error_code: Optional error code for programmatic handling
            metadata: Optional dictionary with additional error context
            cause: Optional underlying exception that caused this error
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.metadata = metadata or {}
        self.cause = cause

    def __str__(self) -> str:
        """Return string representation of the error."""
        if self.error_code:
            return f"[{self.error_code}] {self.message}"
        return self.message

    def __repr__(self) -> str:
        """Return detailed representation of the error."""
        parts = [f"{self.__class__.__name__}(message={self.message!r}"]
        if self.error_code:
            parts.append(f", error_code={self.error_code!r}")
        if self.metadata:
            parts.append(f", metadata={self.metadata}")
        if self.cause:
            parts.append(f", cause={self.cause!r}")
        parts.append(")")
        return "".join(parts)


def _init_scoped_context_error(
    error: BaseAppError,
    *,
    scope_name: str,
    scope_value: Optional[str],
    message: str,
    default_error_code: str,
    error_code: Optional[str],
    metadata: Optional[Dict[str, Any]],
    cause: Optional[Exception],
) -> None:
    """Initialize a scoped error and mirror scope value to attribute + metadata."""
    BaseAppError.__init__(
        error,
        message=message,
        error_code=error_code or default_error_code,
        metadata=_merge_metadata_if(
            metadata,
            bool(scope_value),
            **{scope_name: scope_value},
        ),
        cause=cause,
    )
    setattr(error, scope_name, scope_value)


def _init_optional_scoped_context_error(
    error: Any,
    *,
    init_method: Any,
    scope_name: str,
    scope_value: Optional[str],
    message: str,
    metadata: Optional[Dict[str, Any]],
    cause: Optional[Exception],
    field_name: str,
    field_value: Any,
    default_error_code: str,
) -> None:
    """Initialize scoped error and merge one optional metadata field."""
    init_method(
        error,
        message=message,
        metadata=_metadata_with_optional_field(metadata, field_name, field_value),
        cause=cause,
        error_code=default_error_code,
        **{scope_name: scope_value},
    )
