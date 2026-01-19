"""
Security Executor for Tool Execution.

This module provides the security executor that handles tool execution with
sandboxing, isolation, and security boundaries. Currently implements a basic
executor, but can be extended for process/container isolation.
"""
from abc import ABC, abstractmethod
from typing import Any
import logging

from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext

logger = logging.getLogger(__name__)

class ToolExecutor(ABC):
    """
    Abstract base class for executing tools.
    Implementations can provide isolation (processes, containers, etc).
    """

    @abstractmethod
    async def execute(self, tool: Tool, args: Any, context: ToolContext) -> Any:
        """
        Execute the tool with the given arguments and context.
        """
        pass

class DirectToolExecutor(ToolExecutor):
    """
    Executes tools directly in the current process.
    No isolation, but lowest overhead.
    """
    async def execute(self, tool: Tool, args: Any, context: ToolContext) -> Any:
        return await tool.run(args, context)

class ProcessSandboxedExecutor(ToolExecutor):
    """
    Executes tools in a separate process for isolation.
    Limitations:
    - Context and Args must be picklable.
    - Tool must be importable.
    - Side effects on global state (if any) won't persist.
    """
    async def execute(self, tool: Tool, args: Any, context: ToolContext) -> Any:
        # SECURITY: Do not silently fall back to insecure execution
        # Raise error to prevent usage in insecure contexts
        raise NotImplementedError(
            f"ProcessSandboxedExecutor is not fully implemented. "
            f"Cannot execute {tool.name} in sandbox. "
            f"Use DirectToolExecutor if sandboxing is not required, "
            f"or implement process isolation before using this executor."
        )

_global_executor: ToolExecutor = DirectToolExecutor()

def get_tool_executor() -> ToolExecutor:
    return _global_executor

def set_tool_executor(executor: ToolExecutor):
    global _global_executor
    _global_executor = executor

