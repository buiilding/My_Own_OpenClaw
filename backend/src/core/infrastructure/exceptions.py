"""
Centralized exception hierarchy for the application.

All custom exceptions should inherit from BaseAppError to ensure
consistent error handling and logging throughout the system.
"""

from typing import Any, Dict, List, Optional


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


# ============================================================================
# Configuration Errors
# ============================================================================

class ConfigurationError(BaseAppError):
    """Raised when there's an error with application configuration."""
    
    def __init__(
        self,
        message: str,
        config_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="CONFIG_ERROR",
            metadata=_merge_metadata_if(metadata, bool(config_key), config_key=config_key),
            cause=cause,
        )
        self.config_key = config_key


# ============================================================================
# LLM Errors
# ============================================================================

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
        super().__init__(
            message=message,
            error_code=error_code or self.default_error_code,
            metadata=_merge_metadata_if(metadata, bool(model), model=model),
            cause=cause,
        )
        self.model = model

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
        LLMError.__init__(
            self,
            message=message,
            model=model,
            metadata=_metadata_with_optional_field(metadata, field_name, field_value),
            cause=cause,
            error_code=self.default_error_code,
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


# ============================================================================
# Tool Execution Errors
# ============================================================================

class ToolExecutionError(BaseAppError):
    """Raised when a tool execution fails."""
    
    def __init__(
        self,
        message: str,
        tool_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="TOOL_EXECUTION_ERROR",
            metadata=_merge_metadata_if(metadata, bool(tool_name), tool_name=tool_name),
            cause=cause,
        )
        self.tool_name = tool_name


class ToolValidationError(ToolExecutionError):
    """Raised when tool parameter validation fails."""
    
    def __init__(
        self,
        message: str,
        tool_name: Optional[str] = None,
        validation_errors: Optional[list] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            tool_name=tool_name,
            metadata=_merge_metadata_if(
                metadata,
                bool(validation_errors),
                validation_errors=validation_errors,
            ),
            cause=cause,
        )
        self.error_code = "TOOL_VALIDATION_ERROR"
        self.validation_errors = validation_errors or []


class ToolNotFoundError(ToolExecutionError):
    """Raised when a requested tool is not found."""
    
    def __init__(
        self,
        tool_name: str,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=f"Tool '{tool_name}' not found",
            tool_name=tool_name,
            metadata=metadata,
            cause=cause,
        )
        self.error_code = "TOOL_NOT_FOUND"


# ============================================================================
# Memory Errors
# ============================================================================

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
        super().__init__(
            message=message,
            error_code=error_code or self.default_error_code,
            metadata=_merge_metadata_if(metadata, bool(user_id), user_id=user_id),
            cause=cause,
        )
        self.user_id = user_id

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
        MemoryError.__init__(
            self,
            message=message,
            user_id=user_id,
            metadata=_metadata_with_optional_field(metadata, field_name, field_value),
            cause=cause,
            error_code=self.default_error_code,
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


# ============================================================================
# Session Errors
# ============================================================================

class SessionError(BaseAppError):
    """Raised when there's an error with agent sessions."""
    
    def __init__(
        self,
        message: str,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="SESSION_ERROR",
            metadata=_merge_metadata_if(
                metadata,
                bool(session_id or user_id),
                session_id=session_id,
                user_id=user_id,
            ),
            cause=cause,
        )
        self.session_id = session_id
        self.user_id = user_id


# ============================================================================
# Trust Boundary Errors (Security)
# ============================================================================

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
