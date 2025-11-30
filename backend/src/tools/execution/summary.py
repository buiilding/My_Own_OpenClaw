"""
Execution Summary Generation.

Creates human-readable summaries of tool execution results.
"""
from typing import List

from backend.src.tools.execution.types import ToolExecutionResult


def create_execution_summary(
    results: List[ToolExecutionResult], total_time: float
) -> str:
    """
    Create a summary of tool execution results.

    Args:
        results: List of tool execution results
        total_time: Total execution time in seconds

    Returns:
        Human-readable summary string
    """
    if not results:
        return "No tools executed"

    total_tools = len(results)
    successful_tools = sum(1 for r in results if r.success)
    failed_tools = total_tools - successful_tools

    parts = [
        f"Executed {total_tools} tool(s) in {total_time:.2f}s",
        f"✓ {successful_tools} successful",
    ]

    if failed_tools > 0:
        parts.append(f"✗ {failed_tools} failed")

    return " | ".join(parts)
