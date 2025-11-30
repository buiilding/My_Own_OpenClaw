"""
Batch Executor for Tool Execution.

Executes multiple tool calls in parallel batches with concurrency control.
"""
import asyncio
import logging
from typing import TYPE_CHECKING, Any, List

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.execution.types import ToolExecutionResult

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class BatchExecutor:
    """
    Executes multiple tool calls in parallel batches.
    """

    def __init__(self, tool_orchestrator: "ToolOrchestrator", config: Any):
        """
        Initialize the batch executor.

        Args:
            tool_orchestrator: ToolOrchestrator instance for executing tools
            config: Application configuration (for user_id/session_id)
        """
        self.tool_orchestrator = tool_orchestrator
        self.config = config

    async def execute_tools_batch(
        self, tool_calls: List[ParsedToolCall], max_concurrent: int = 3
    ) -> List[ToolExecutionResult]:
        """
        Execute multiple tool calls in parallel batches.

        Args:
            tool_calls: List of tool calls to execute
            max_concurrent: Maximum number of concurrent executions

        Returns:
            List of execution results
        """

        # Get user_id and session_id from config if available
        user_id = getattr(self.config, "user_id", "default_user")
        session_id = getattr(self.config, "session_id", "default_session")
        session_ref = getattr(self.config, "session_ref", None)

        async def execute_with_semaphore(
            semaphore: asyncio.Semaphore, tool_call: ParsedToolCall
        ):
            async with semaphore:
                return await self.tool_orchestrator.execution_engine.execute(
                    tool_call,
                    user_id=user_id,
                    session_id=session_id,
                    session_ref=session_ref,
                )

        semaphore = asyncio.Semaphore(max_concurrent)
        tasks = [
            execute_with_semaphore(semaphore, tool_call) for tool_call in tool_calls
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Handle exceptions in results
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                tool_call = tool_calls[i]
                error_result = ToolExecutionResult(
                    tool_call=tool_call,
                    result=ToolResult(
                        success=False,
                        error=f"Execution failed: {str(result)}",
                        llm_content=f"Error: Execution failed: {str(result)}",
                        return_display=f"Tool execution failed: {str(result)}",
                    ),
                    execution_time=0.0,
                    success=False,
                )
                final_results.append(error_result)
            else:
                final_results.append(result)

        return final_results
