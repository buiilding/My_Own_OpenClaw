"""
Result creation helpers for tool orchestration.

Pure helper functions for creating tool result objects in a consistent format.
No side effects beyond object creation.
"""
from types import SimpleNamespace
from typing import Any

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall


def create_tool_result_object(
    tool_call: ParsedToolCall,
    tool_result: ToolResult,
    execution_time: float = 0.1,
) -> Any:
    """
    Create a SimpleNamespace object compatible with InteractionLoop's expectations.
    
    This is the standard format for tool execution results used throughout the orchestrator.
    
    Args:
        tool_call: The tool call that was executed
        tool_result: The result from tool execution
        execution_time: Execution time in seconds (default 0.1 for frontend-executed tools)
        
    Returns:
        SimpleNamespace with tool_call, result, success, execution_time, and context fields
    """
    return SimpleNamespace(
        tool_call=tool_call,
        result=tool_result,
        success=tool_result.success,
        execution_time=execution_time,
        context=None,
    )


def create_empty_tool_results() -> Any:
    """
    Create an empty tool results container.
    
    Returns:
        SimpleNamespace with empty tool_results list
    """
    return SimpleNamespace(tool_results=[])
