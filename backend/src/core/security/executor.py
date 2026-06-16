"""
Security Executor for Tool Execution.

This module provides the security executor registry for tool execution.
"""

from abc import ABC, abstractmethod
import threading
from typing import Any, TYPE_CHECKING
import logging

from backend.src.sdk.context import ToolContext

if TYPE_CHECKING:
    from backend.src.sdk.tool import Tool

logger = logging.getLogger(__name__)


class ToolExecutor(ABC):
    """
    Abstract base class for executing tools.
    Implementations can provide isolation (processes, containers, etc).
    """

    @abstractmethod
    async def execute(self, tool: "Tool", args: Any, context: ToolContext) -> Any:
        """
        Execute the tool with the given arguments and context.
        """
        pass


class DirectToolExecutor(ToolExecutor):
    """
    Executes tools directly in the current process.
    No isolation, but lowest overhead.
    """

    async def execute(self, tool: "Tool", args: Any, context: ToolContext) -> Any:
        return await tool.run(args, context)


_global_executor: ToolExecutor = DirectToolExecutor()


class _ToolExecutorRegistry:
    """Thread-safe runtime registry for active ToolExecutor implementation."""

    def __init__(self, default_executor: ToolExecutor):
        self._executor = default_executor
        self._lock = threading.RLock()

    def get(self) -> ToolExecutor:
        with self._lock:
            return self._executor

    def set(self, executor: ToolExecutor) -> None:
        with self._lock:
            self._executor = executor


_executor_registry = _ToolExecutorRegistry(_global_executor)


def get_tool_executor() -> ToolExecutor:
    return _executor_registry.get()


def set_tool_executor(executor: ToolExecutor):
    _executor_registry.set(executor)
