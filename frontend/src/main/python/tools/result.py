"""
Standardized tool result types for local backend.
"""

from typing import Any, Dict, Optional
from dataclasses import dataclass, field


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
        if self.data:
            result["data"] = self.data
        if self.error:
            result["error"] = self.error
        return result
    
    @classmethod
    def success_result(cls, data: Dict[str, Any]) -> "ToolResult":
        """Create a success result."""
        return cls(success=True, data=data)
    
    @classmethod
    def error_result(cls, error: str) -> "ToolResult":
        """Create an error result."""
        return cls(success=False, error=error)
