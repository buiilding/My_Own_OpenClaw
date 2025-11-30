"""
Result Aggregator for Tool Execution.

Aggregates multiple tool execution results into a single OrchestrationResult,
handling timing, success tracking, and summary generation.
"""
import logging
from typing import List

from backend.src.tools.execution.summary import create_execution_summary
from backend.src.tools.execution.types import OrchestrationResult, ToolExecutionResult

logger = logging.getLogger(__name__)


class ResultAggregator:
    """
    Aggregates tool execution results into orchestration results.

    Handles result collection, timing calculation, success tracking,
    and summary generation.
    """

    def aggregate(
        self,
        results: List[ToolExecutionResult],
        total_execution_time: float,
    ) -> OrchestrationResult:
        """
        Aggregate tool execution results into an OrchestrationResult.

        Args:
            results: List of individual tool execution results
            total_execution_time: Total time taken for all executions

        Returns:
            OrchestrationResult with aggregated information
        """
        all_successful = all(result.success for result in results)
        summary = create_execution_summary(results, total_execution_time)

        return OrchestrationResult(
            tool_results=results,
            total_execution_time=total_execution_time,
            all_successful=all_successful,
            summary=summary,
        )

    def aggregate_empty(
        self, message: str = "No tool calls to execute"
    ) -> OrchestrationResult:
        """
        Create an empty OrchestrationResult for cases with no tool calls.

        Args:
            message: Summary message

        Returns:
            Empty OrchestrationResult
        """
        return OrchestrationResult(
            tool_results=[],
            total_execution_time=0.0,
            all_successful=True,
            summary=message,
        )
