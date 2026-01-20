"""
Type definitions for tool execution.

Contains shared data classes used across tool execution modules.

Type Hierarchy:
    ToolResult (core/interfaces/tool.py)
        - Base result type from tool execution
        - Contains: success, data, error, llm_content, return_display, etc.
        - This is the canonical format - tools should return ToolResult directly
    
    ToolExecutionResult (this module)
        - Wraps ToolResult with execution metadata
        - Contains: tool_call, result (ToolResult), execution_time, success, context
        - Used by ToolExecutionEngine.execute()
        - Composition: result field contains ToolResult (not conversion)
    
    OrchestrationResult (this module)
        - Aggregates multiple ToolExecutionResult instances
        - Contains: tool_results (List[ToolExecutionResult]), total_execution_time, etc.
        - Used by ToolOrchestrator for batch execution
        - Composition: aggregates ToolExecutionResult (not conversion)

Usage Guidelines:
    - Tools should return ToolResult directly (not dicts)
    - ToolExecutionResult wraps ToolResult with metadata
    - OrchestrationResult aggregates ToolExecutionResult instances
    - No conversions needed - use composition, not transformation
"""
from dataclasses import dataclass
from typing import List, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall

if False:  # TYPE_CHECKING
    from backend.src.sdk.context import ToolContext


@dataclass
class ToolExecutionResult:
    """
    Result of executing a tool call.
    
    Wraps ToolResult with execution metadata (timing, tool call info, context).
    Uses composition - result field contains ToolResult instance.
    """

    tool_call: ParsedToolCall
    result: ToolResult  # Canonical tool result (composition, not conversion)
    execution_time: float
    success: bool  # Derived from result.success, kept for convenience
    context: Optional["ToolContext"] = None  # Execution context (for accessing active_window, etc.)


@dataclass
class OrchestrationResult:
    """
    Overall result of orchestrating multiple tool calls.
    
    Aggregates multiple ToolExecutionResult instances.
    Uses composition - tool_results contains list of ToolExecutionResult.
    """

    tool_results: List[ToolExecutionResult]  # Aggregated results (composition)
    total_execution_time: float
    all_successful: bool
    summary: str
