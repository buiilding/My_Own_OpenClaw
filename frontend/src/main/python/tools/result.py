"""
Standardized tool result types for local backend.
"""

from typing import Any, Dict, Optional
from dataclasses import dataclass


_DERIVED_OUTPUT_KEYS = {
    "display_content",
    "return_display",
    "llm_content",
    "model_llm_content",
    "llm_content_original_tokens",
    "llm_content_token_limit",
    "llm_content_truncated",
    "llm_content_token_source",
    "output_token_limit",
    "output_truncated",
    "original_output_tokens",
}


def _normalize_output_data(data: Dict[str, Any]) -> Dict[str, Any]:
    output = ""
    for key in (
        "output",
        "message",
        "error",
        "llm_content",
        "return_display",
        "display_content",
        "model_llm_content",
        "content",
    ):
        if key in data and data[key] not in ("", None):
            output = data[key]
            break
    normalized = {
        key: value
        for key, value in data.items()
        if key not in _DERIVED_OUTPUT_KEYS
    }
    normalized["output"] = output
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
            result["data"] = self.data
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
