"""Typed tool execution result models shared by orchestrator and agent processing."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall


@dataclass(slots=True)
class ToolExecutionResult:
    """One executed tool call and its normalized result payload."""

    tool_call: ParsedToolCall
    result: ToolResult
    success: bool
    execution_time: float
    context: Optional[Any] = None


@dataclass(slots=True)
class ToolExecutionBatch:
    """Container for all tool execution results in one agent turn."""

    tool_results: list[ToolExecutionResult] = field(default_factory=list)
