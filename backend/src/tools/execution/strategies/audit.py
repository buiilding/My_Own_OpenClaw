"""
Audit Execution Strategy.

Audits tool execution for security and debugging.
"""
import logging
from typing import Any, Optional

from backend.src.tools.execution.strategies.base import (
    ExecutionContext,
    ExecutionResult,
    ExecutionStrategy,
)

logger = logging.getLogger(__name__)


class AuditExecutionStrategy(ExecutionStrategy):
    """
    Execution strategy that audits tool execution.

    Logs execution details for security and debugging.
    """

    def __init__(
        self,
        audit_logger: Any,  # Function or object with audit method
        next_strategy: Optional[ExecutionStrategy] = None,
    ):
        """
        Initialize audit strategy.

        Args:
            audit_logger: Audit logging function or object
            next_strategy: Next strategy in chain
        """
        super().__init__(next_strategy)
        self.audit_logger = audit_logger

    async def execute(self, exec_context: ExecutionContext) -> ExecutionResult:
        """Execute with audit logging."""
        # Execute next strategy
        result = await self._execute_next(exec_context)

        # Audit the execution
        try:
            from backend.src.core.security import audit_tool_execution

            audit_tool_execution(
                tool_name=exec_context.tool_call.tool_name,
                user_id=exec_context.user_id,
                session_id=exec_context.session_id,
                parameters=exec_context.tool_call.parameters,
                success=result.success,
                execution_time=result.execution_time,
                error=result.error,
            )
        except Exception as e:
            logger.error(f"Error in audit logging: {e}", exc_info=True)

        return result
