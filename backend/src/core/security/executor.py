from abc import ABC, abstractmethod
from typing import Any, TypeVar
import asyncio
import logging

from backend.sdk.tool import Tool
from backend.sdk.context import Context

logger = logging.getLogger(__name__)

class ToolExecutor(ABC):
    """
    Abstract base class for executing tools.
    Implementations can provide isolation (processes, containers, etc).
    """

    @abstractmethod
    async def execute(self, tool: Tool, args: Any, context: Context) -> Any:
        """
        Execute the tool with the given arguments and context.
        """
        pass

class DirectToolExecutor(ToolExecutor):
    """
    Executes tools directly in the current process.
    No isolation, but lowest overhead.
    """
    async def execute(self, tool: Tool, args: Any, context: Context) -> Any:
        return await tool.run(args, context)

class ProcessSandboxedExecutor(ToolExecutor):
    """
    Executes tools in a separate process for isolation.
    Limitations:
    - Context and Args must be picklable.
    - Tool must be importable.
    - Side effects on global state (if any) won't persist.
    """
    async def execute(self, tool: Tool, args: Any, context: Context) -> Any:
        # TODO: Implement multiprocessing.Process wrapper
        # For now, falls back to direct execution but logs a warning/placeholder
        logger.warning(f"ProcessSandboxedExecutor not fully implemented. Executing {tool.name} directly.")
        return await tool.run(args, context)

_global_executor: ToolExecutor = DirectToolExecutor()

def get_tool_executor() -> ToolExecutor:
    return _global_executor

def set_tool_executor(executor: ToolExecutor):
    global _global_executor
    _global_executor = executor

