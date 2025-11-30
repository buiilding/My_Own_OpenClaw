"""
Type definitions for tool execution.

Contains shared data classes used across tool execution modules.
"""
from dataclasses import dataclass
from typing import List

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall


@dataclass
class ToolExecutionResult:
    """Result of executing a tool call."""

    tool_call: ParsedToolCall
    result: ToolResult
    execution_time: float
    success: bool


@dataclass
class OrchestrationResult:
    """Overall result of orchestrating multiple tool calls."""

    tool_results: List[ToolExecutionResult]
    total_execution_time: float
    all_successful: bool
    summary: str
