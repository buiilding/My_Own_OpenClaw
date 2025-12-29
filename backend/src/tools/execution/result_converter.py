"""
Result Converter Utility.

DEPRECATED: Use ToolResult.from_dict() directly instead.
This module is kept for backward compatibility only.
"""
from typing import Any, Dict

from backend.src.core.interfaces.tool import ToolResult


def dict_to_tool_result(result_dict: Dict[str, Any]) -> ToolResult:
    """
    Convert SDK tool result dict to ToolResult for compatibility.
    
    DEPRECATED: Use ToolResult.from_dict() directly instead.
    This function is kept for backward compatibility.

    Args:
        result_dict: SDK tool result dictionary

    Returns:
        ToolResult instance
    """
    return ToolResult.from_dict(result_dict)
