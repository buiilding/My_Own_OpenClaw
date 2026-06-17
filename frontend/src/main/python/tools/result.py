"""Standardized tool result types for local sidecar runtime tools."""

from typing import Any, Dict, Optional
from dataclasses import dataclass


def _normalize_output_data(data: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(data)
    output = normalized.get("output")
    if output is None:
        output = normalized.get("message")
    if output is None:
        output = normalized.get("error")
    normalized["output"] = "" if output is None else output
    return normalized


@dataclass
class ToolResult:
    """
    Standardized tool execution result.
    
    All tools should return this structure for consistency.
    """
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format for JSON-RPC response."""
        result = {"success": self.success}
        if self.data is not None:
            data = dict(self.data)
            if not self.success and self.error and "output" not in data:
                data["output"] = self.error
            result["data"] = _normalize_output_data(data)
        if self.error is not None:
            result["error"] = self.error
        return result
    
    @classmethod
    def success_result(cls, data: Dict[str, Any]) -> "ToolResult":
        """Create a success result."""
        return cls(success=True, data=_normalize_output_data(data))
    
    @classmethod
    def error_result(cls, error: str) -> "ToolResult":
        """Create an error result."""
        return cls(success=False, error=error, data={"output": error})
