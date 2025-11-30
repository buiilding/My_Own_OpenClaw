"""
Validation Execution Strategy.

Validates tool parameters before execution.
"""
import logging
import time
from typing import Any, Optional

from backend.src.tools.execution.strategies.base import (
    ExecutionContext,
    ExecutionResult,
    ExecutionStrategy,
)

logger = logging.getLogger(__name__)


class ValidationExecutionStrategy(ExecutionStrategy):
    """
    Execution strategy that validates tool parameters.

    Ensures tool exists and parameters are valid before execution.
    """

    def __init__(
        self,
        tool_registry: Any,  # ToolRegistry
        next_strategy: Optional[ExecutionStrategy] = None,
    ):
        """
        Initialize validation strategy.

        Args:
            tool_registry: ToolRegistry instance
            next_strategy: Next strategy in chain
        """
        super().__init__(next_strategy)
        self.tool_registry = tool_registry

    async def execute(self, exec_context: ExecutionContext) -> ExecutionResult:
        """Execute with validation."""
        tool_name = exec_context.tool_call.tool_name
        execution_time = time.time() - exec_context.start_time

        logger.debug(f"Validation strategy: Checking tool '{tool_name}'")

        # Check if tool exists
        if not self.tool_registry.is_tool_available(tool_name):
            error_msg = f"Tool '{tool_name}' is not available"
            logger.error(f"VALIDATION FAILED: {error_msg}")
            logger.error(
                f"Available tools: {list(self.tool_registry.get_tool_names())}"
            )
            return ExecutionResult(
                success=False,
                error=error_msg,
                execution_time=execution_time,
            )

        # Get tool instance
        try:
            tool = self.tool_registry.get_tool(tool_name)
            if not tool:
                error_msg = f"Tool '{tool_name}' could not be retrieved from registry"
                logger.error(f"VALIDATION FAILED: {error_msg}")
                return ExecutionResult(
                    success=False,
                    error=error_msg,
                    execution_time=execution_time,
                )
            exec_context.tool = tool
            logger.debug(
                f"Validation strategy: Tool '{tool_name}' retrieved successfully"
            )
        except Exception as e:
            error_msg = f"Error retrieving tool '{tool_name}': {str(e)}"
            logger.error(f"VALIDATION FAILED: {error_msg}", exc_info=True)
            return ExecutionResult(
                success=False,
                error=error_msg,
                execution_time=execution_time,
            )

        # Validate parameters using Pydantic
        try:
            logger.debug(
                f"Validation strategy: Validating parameters for '{tool_name}': {exec_context.tool_call.parameters}"
            )
            validated_args = exec_context.tool.args_model(
                **exec_context.tool_call.parameters
            )
            exec_context.args = validated_args
            logger.debug(
                f"Validation strategy: Parameters validated successfully for '{tool_name}'"
            )
        except Exception as e:
            error_msg = f"Invalid parameters for tool '{tool_name}': {str(e)}"
            logger.error(f"VALIDATION FAILED: {error_msg}")
            logger.error(f"Tool args_model: {exec_context.tool.args_model}")
            logger.error(f"Raw parameters: {exec_context.tool_call.parameters}")
            return ExecutionResult(
                success=False,
                error=error_msg,
                execution_time=execution_time,
            )

        logger.debug(f"Validation strategy: All checks passed for '{tool_name}'")
        # Validation passed, proceed
        return await self._execute_next(exec_context)
