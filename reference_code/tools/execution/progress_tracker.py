"""
Progress Tracker for Tool Execution.

Tracks and reports progress during tool execution with streaming updates.
"""
import logging
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedResponse
from backend.src.tools.execution.summary import create_execution_summary
from backend.src.tools.execution.types import ToolExecutionResult

if TYPE_CHECKING:
    from backend.src.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)


class ProgressTracker:
    """
    Tracks progress of tool execution and yields progress events.
    """

    def __init__(self, tool_orchestrator: "ToolOrchestrator", config: Any):
        """
        Initialize the progress tracker.

        Args:
            tool_orchestrator: ToolOrchestrator instance for executing tools
            config: Application configuration (for user_id/session_id)
        """
        self.tool_orchestrator = tool_orchestrator
        self.config = config

    async def execute_tools_with_progress(
        self,
        parsed_response: ParsedResponse,
        progress_callback: Optional[callable] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute tools with progress updates.

        Args:
            parsed_response: Parsed response with tool calls
            progress_callback: Optional callback for progress updates

        Yields:
            Progress updates and final results
        """
        if not parsed_response.has_tool_calls:
            yield {"type": "no_tools", "message": "No tool calls to execute"}
            return

        total_tools = len(parsed_response.tool_calls)
        completed_tools = 0

        yield {
            "type": "execution_started",
            "total_tools": total_tools,
            "message": f"Starting execution of {total_tools} tool(s)",
        }

        results = []

        for i, tool_call in enumerate(parsed_response.tool_calls, 1):
            yield {
                "type": "tool_started",
                "tool_index": i,
                "tool_name": tool_call.tool_name,
                "parameters": tool_call.parameters,
                "message": f"Executing {tool_call.tool_name}...",
            }

            # Get user_id and session_id from config if available
            user_id = getattr(self.config, "user_id", "default_user")
            session_id = getattr(self.config, "session_id", "default_session")
            session_ref = getattr(self.config, "session_ref", None)

            try:
                execution_result = (
                    await self.tool_orchestrator.execution_engine.execute(
                        tool_call,
                        user_id=user_id,
                        session_id=session_id,
                        session_ref=session_ref,
                    )
                )
                results.append(execution_result)
                completed_tools += 1

                yield {
                    "type": "tool_completed",
                    "tool_index": i,
                    "tool_name": tool_call.tool_name,
                    "success": execution_result.success,
                    "execution_time": execution_result.execution_time,
                    "result": execution_result.result,
                    "message": f"{'✓' if execution_result.success else '✗'} {tool_call.tool_name} completed in {execution_result.execution_time:.2f}s",
                }

                if progress_callback:
                    progress_callback(i, total_tools, execution_result)

            except Exception as e:
                # Don't log full exception context to avoid logging screenshot data in traceback
                logger.error(f"Tool execution error: {e}", exc_info=False)

                error_result = ToolExecutionResult(
                    tool_call=tool_call,
                    result=ToolResult(
                        success=False,
                        error=str(e),
                        llm_content=f"Error: {str(e)}",
                        return_display=f"Tool execution failed: {str(e)}",
                    ),
                    execution_time=0.0,
                    success=False,
                )
                results.append(error_result)
                completed_tools += 1

                yield {
                    "type": "tool_failed",
                    "tool_index": i,
                    "tool_name": tool_call.tool_name,
                    "error": str(e),
                    "message": f"✗ {tool_call.tool_name} failed: {str(e)}",
                }

        # Final summary
        successful_tools = sum(1 for r in results if r.success)
        total_time = sum(r.execution_time for r in results)

        yield {
            "type": "execution_completed",
            "total_tools": total_tools,
            "successful_tools": successful_tools,
            "total_time": total_time,
            "all_successful": successful_tools == total_tools,
            "results": results,
            "summary": create_execution_summary(results, total_time),
        }
