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
    
    def __init__(
        self,
        message: str,
        model: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="LLM_ERROR",
            metadata=_merge_metadata_if(metadata, bool(model), model=model),
            cause=cause,
        )
        self.model = model


class LLMAPIError(LLMError):
    """Raised for general LLM API errors."""
    
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
            metadata=_merge_metadata_if(metadata, bool(status_code), status_code=status_code),
            cause=cause,
        )
        self.error_code = "LLM_API_ERROR"
        self.status_code = status_code


class LLMRateLimitError(LLMError):
    """Raised when an LLM API rate limit is exceeded."""
    
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
            metadata=_merge_metadata_if(metadata, bool(retry_after), retry_after=retry_after),
            cause=cause,
        )
        self.error_code = "LLM_RATE_LIMIT"
        self.retry_after = retry_after


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
    
    def __init__(
        self,
        message: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="MEMORY_ERROR",
            metadata=_merge_metadata_if(metadata, bool(user_id), user_id=user_id),
            cause=cause,
        )
        self.user_id = user_id


class MemoryStoreError(MemoryError):
    """Raised when memory storage operations fail."""
    
    def __init__(
        self,
        message: str,
        user_id: Optional[str] = None,
        operation: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            user_id=user_id,
            metadata=_merge_metadata_if(metadata, bool(operation), operation=operation),
            cause=cause,
        )
        self.error_code = "MEMORY_STORE_ERROR"
        self.operation = operation


class EmbeddingError(MemoryError):
    """Raised when embedding generation fails."""
    
    def __init__(
        self,
        message: str,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            user_id=user_id,
            metadata=metadata,
            cause=cause,
        )
        self.error_code = "EMBEDDING_ERROR"


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

class InputSizeLimitError(BaseAppError):
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
            metadata=_merge_metadata_if(
                metadata,
                any([actual_size, max_size, boundary_name]),
                actual_size=actual_size,
                max_size=max_size,
                boundary_name=boundary_name,
            ),
            cause=cause,
        )
        self.actual_size = actual_size
        self.max_size = max_size
        self.boundary_name = boundary_name


class ParseTimeoutError(BaseAppError):
    """Raised when parsing exceeds timeout in trust boundaries."""
    
    def __init__(
        self,
        message: str,
        timeout_seconds: Optional[float] = None,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="PARSE_TIMEOUT_ERROR",
            metadata=_merge_metadata_if(
                metadata,
                any([timeout_seconds, boundary_name]),
                timeout_seconds=timeout_seconds,
                boundary_name=boundary_name,
            ),
            cause=cause,
        )
        self.timeout_seconds = timeout_seconds
        self.boundary_name = boundary_name


class ParseValidationError(BaseAppError):
    """Raised when parsed data fails validation in trust boundaries."""
    
    def __init__(
        self,
        message: str,
        validation_errors: Optional[List[str]] = None,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="PARSE_VALIDATION_ERROR",
            metadata=_merge_metadata_if(
                metadata,
                any([validation_errors, boundary_name]),
                validation_errors=validation_errors,
                boundary_name=boundary_name,
            ),
            cause=cause,
        )
        self.validation_errors = validation_errors or []
        self.boundary_name = boundary_name


