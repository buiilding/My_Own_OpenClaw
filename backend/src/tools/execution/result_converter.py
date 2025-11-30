"""
Result Converter Utility.

Converts SDK tool result dictionaries to ToolResult objects for compatibility.
"""
from typing import Any, Dict

from backend.src.core.interfaces.tool import ToolResult


def dict_to_tool_result(result_dict: Dict[str, Any]) -> ToolResult:
    """
    Convert SDK tool result dict to ToolResult for compatibility.

    Args:
        result_dict: SDK tool result dictionary

    Returns:
        ToolResult instance
    """
    success = result_dict.get("success", "error" not in result_dict)
    error = result_dict.get("error")
    llm_content = result_dict.get("llm_content")
    return_display = result_dict.get("return_display")

    # Extract data (everything except special fields)
    data = {
        k: v
        for k, v in result_dict.items()
        if k not in ["success", "error", "llm_content", "return_display"]
    }

    # If data is empty but we have other fields, use the whole dict as data
    if not data and result_dict:
        data = result_dict.copy()
        data.pop("success", None)
        data.pop("error", None)
        data.pop("llm_content", None)
        data.pop("return_display", None)
    # If llm_content is not provided, construct it from data
    if not llm_content:
        if error:
            llm_content = f"Error: {error}"
        elif data:
            # If we have structured data, try to find relevant fields for LLM
            if "output" in data:
                llm_content = data["output"]
            elif "screenshot" in data:
                llm_content = "Screenshot captured successfully"
            else:
                llm_content = str(data)
        else:
            llm_content = "Tool executed successfully"

    return ToolResult(
        success=success,
        data=data if data else None,
        error=error,
        llm_content=llm_content,
        return_display=return_display or llm_content,
    )
