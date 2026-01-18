"""
Centralized exception hierarchy for the application.

All custom exceptions should inherit from BaseAppError to ensure
consistent error handling and logging throughout the system.
"""

from typing import Any, Dict, List, Optional


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
            metadata={**(metadata or {}), "config_key": config_key} if config_key else metadata,
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
            metadata={**(metadata or {}), "model": model} if model else metadata,
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
            metadata={**(metadata or {}), "status_code": status_code} if status_code else metadata,
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
            metadata={**(metadata or {}), "retry_after": retry_after} if retry_after else metadata,
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
            metadata={**(metadata or {}), "tool_name": tool_name} if tool_name else metadata,
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
            metadata={**(metadata or {}), "validation_errors": validation_errors} if validation_errors else metadata,
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
            metadata={**(metadata or {}), "user_id": user_id} if user_id else metadata,
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
            metadata={**(metadata or {}), "operation": operation} if operation else metadata,
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
            metadata={
                **(metadata or {}),
                "session_id": session_id,
                "user_id": user_id,
            } if session_id or user_id else metadata,
            cause=cause,
        )
        self.session_id = session_id
        self.user_id = user_id


# ============================================================================
# Security / Trust Boundary Errors
# ============================================================================

class TrustBoundaryError(BaseAppError):
    """Base exception for trust boundary violations."""
    
    def __init__(
        self,
        message: str,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            error_code="TRUST_BOUNDARY_ERROR",
            metadata={**(metadata or {}), "boundary_name": boundary_name} if boundary_name else metadata,
            cause=cause,
        )
        self.boundary_name = boundary_name


class InputSizeLimitError(TrustBoundaryError):
    """Raised when input exceeds size limits."""
    
    def __init__(
        self,
        message: str,
        actual_size: int,
        max_size: int,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            boundary_name=boundary_name,
            metadata={**(metadata or {}), "actual_size": actual_size, "max_size": max_size},
            cause=cause,
        )
        self.error_code = "INPUT_SIZE_LIMIT_ERROR"
        self.actual_size = actual_size
        self.max_size = max_size


class ParseTimeoutError(TrustBoundaryError):
    """Raised when parsing operation exceeds timeout."""
    
    def __init__(
        self,
        message: str,
        timeout_seconds: float,
        boundary_name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        cause: Optional[Exception] = None,
    ):
        super().__init__(
            message=message,
            boundary_name=boundary_name,
            metadata={**(metadata or {}), "timeout_seconds": timeout_seconds},
            cause=cause,
        )
        self.error_code = "PARSE_TIMEOUT_ERROR"
        self.timeout_seconds = timeout_seconds


class ParseValidationError(TrustBoundaryError):
    """Raised when parsed data fails validation."""
    
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
            boundary_name=boundary_name,
            metadata={**(metadata or {}), "validation_errors": validation_errors or []},
            cause=cause,
        )
        self.error_code = "PARSE_VALIDATION_ERROR"
        self.validation_errors = validation_errors or []



