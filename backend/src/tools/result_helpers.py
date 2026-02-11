"""
Result creation helpers for tool orchestration.

Pure helper functions for creating tool result objects in a consistent format.
No side effects beyond object creation.
"""
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.result_types import ToolExecutionBatch, ToolExecutionResult


def create_tool_result_object(
    tool_call: ParsedToolCall,
    tool_result: ToolResult,
    execution_time: float = 0.1,
) -> ToolExecutionResult:
    """
    Create a typed tool execution result object.
    
    This is the standard format for tool execution results used throughout the orchestrator.
    
    Args:
        tool_call: The tool call that was executed
        tool_result: The result from tool execution
        execution_time: Execution time in seconds (default 0.1 for frontend-executed tools)
        
    Returns:
        ToolExecutionResult object
    """
    return ToolExecutionResult(
        tool_call=tool_call,
        result=tool_result,
        success=tool_result.success,
        execution_time=execution_time,
        context=None,
    )


def create_empty_tool_results() -> ToolExecutionBatch:
    """
    Create an empty tool results container.
    
    Returns:
        ToolExecutionBatch with empty `tool_results`
    """
    return ToolExecutionBatch()
