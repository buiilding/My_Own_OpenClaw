"""Tool-execution exception types."""

from typing import Any, Dict, Optional

from backend.src.core.infrastructure.error_types.base import BaseAppError, _merge_metadata_if


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
