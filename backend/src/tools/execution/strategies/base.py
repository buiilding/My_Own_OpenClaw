"""
Base Execution Strategy Classes.

Provides base classes for tool execution strategies.
"""
import logging
import time
from abc import ABC
from typing import Any, Dict, Optional

from pydantic import BaseModel

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.sdk.context import ToolContext
from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class ExecutionContext:
    """Context passed through execution strategies."""

    def __init__(
        self,
        tool_call: ParsedToolCall,
        tool: SDKTool,
        args: BaseModel,
        context: ToolContext,
        user_id: str,
        session_id: str,
    ):
        self.tool_call = tool_call
        self.tool = tool
        self.args = args
        self.context = context
        self.user_id = user_id
        self.session_id = session_id
        self.start_time = time.time()
        self.metadata: Dict[str, Any] = {}


class ExecutionResult:
    """Result of tool execution.
    
    Wraps ToolResult with execution metadata (timing, etc.).
    The canonical tool result is stored in tool_result field.
    """

    def __init__(
        self,
        success: bool,
        data: Any = None,
        error: Optional[str] = None,
        execution_time: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
        tool_result: Optional[ToolResult] = None,
    ):
        """
        Initialize execution result.

        Args:
            success: Whether execution succeeded
            data: Result data (legacy field, kept for compatibility)
            error: Error message if failed
            execution_time: Execution time in seconds
            metadata: Additional metadata
            tool_result: ToolResult instance (canonical format)
        """
        self.success = success
        self.data = data
        self.error = error
        self.execution_time = execution_time
        self.metadata = metadata or {}
        # Store ToolResult directly (canonical format)
        self.tool_result = tool_result

    def to_tool_result(self) -> ToolResult:
        """
        Convert to ToolResult for compatibility.
        
        If tool_result is already set, return it directly.
        Otherwise, construct from legacy fields.
        """
        if self.tool_result is not None:
            return self.tool_result
        
        # Fallback: construct from legacy fields (should not happen in new code)
        return ToolResult(
            success=self.success,
            data=self.data,
            error=self.error,
            metadata=self.metadata,
            llm_content=f"Error: {self.error}" if self.error else None,
            return_display=f"Error: {self.error}" if self.error else "Tool executed successfully",
        )


class ExecutionStrategy(ABC):
    """
    Abstract base class for tool execution strategies.

    Strategies can be chained together to compose execution logic:
    SecurityStrategy -> AuditStrategy -> CacheStrategy -> ExecuteStrategy
    """

    def __init__(self, next_strategy: Optional["ExecutionStrategy"] = None):
        """
        Initialize the strategy.

        Args:
            next_strategy: Next strategy in the chain (None for terminal strategy)
        """
        self.next_strategy = next_strategy

    async def execute(self, exec_context: ExecutionContext) -> ExecutionResult:
        """
        Execute the strategy logic.

        Default implementation passes to next strategy or executes tool.
        Override in subclasses to add custom logic.

        Args:
            exec_context: Execution context

        Returns:
            ExecutionResult
        """
        return await self._execute_next(exec_context)

    async def _execute_next(self, exec_context: ExecutionContext) -> ExecutionResult:
        """Execute the next strategy in the chain."""
        if self.next_strategy:
            return await self.next_strategy.execute(exec_context)
        else:
            # Terminal strategy - actually execute the tool
            return await self._execute_tool(exec_context)

    async def _execute_tool(self, exec_context: ExecutionContext) -> ExecutionResult:
        """
        Actually execute the tool (terminal strategy).

        Tools should return ToolResult directly. For backward compatibility,
        dict results are converted to ToolResult using ToolResult.from_dict().
        """
        try:
            result = await exec_context.tool.run(
                exec_context.args, exec_context.context
            )

            execution_time = time.time() - exec_context.start_time

            # Convert to ToolResult if needed (backward compatibility)
            if isinstance(result, ToolResult):
                tool_result = result
            elif isinstance(result, dict):
                # Legacy dict format - convert using single conversion point
                tool_result = ToolResult.from_dict(result)
            else:
                # Non-dict, non-ToolResult result - wrap it
                tool_result = ToolResult(
                    success=True,
                    data=result,
                    llm_content=str(result),
                    return_display=str(result),
                )

            # Convert ToolResult to ExecutionResult (preserving all fields)
            return ExecutionResult(
                success=tool_result.success,
                data=tool_result.data,
                error=tool_result.error,
                execution_time=execution_time,
                metadata=tool_result.metadata,
                tool_result=tool_result,  # Store ToolResult directly
            )

        except Exception as e:
            execution_time = time.time() - exec_context.start_time
            # Sanitize any result data that might contain screenshot before logging
            # Don't log full exception context if it might contain large base64 data
            logger.error(
                f"Tool execution error for {exec_context.tool_call.tool_name}: {e}",
                exc_info=False,  # Don't include full traceback to avoid logging screenshot data
            )
            return ExecutionResult(
                success=False,
                error=f"Tool execution failed: {str(e)}",
                execution_time=execution_time,
            )
