"""
Security Execution Strategy.

Performs security checks before tool execution.
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


class SecurityExecutionStrategy(ExecutionStrategy):
    """
    Execution strategy that performs security checks before execution.

    Checks permissions and resource limits.
    """

    def __init__(
        self,
        security_policy: Any,  # SecurityPolicy
        next_strategy: Optional[ExecutionStrategy] = None,
    ):
        """
        Initialize security strategy.

        Args:
            security_policy: SecurityPolicy instance
            next_strategy: Next strategy in chain
        """
        super().__init__(next_strategy)
        self.security_policy = security_policy

    async def execute(self, exec_context: ExecutionContext) -> ExecutionResult:
        """Execute security checks."""

        tool_name = exec_context.tool_call.tool_name
        execution_time = time.time() - exec_context.start_time

        logger.debug(f"Security strategy: Checking permissions for '{tool_name}'")

        # Determine required permission
        required_permission = self._get_required_permission(tool_name)
        logger.debug(
            f"Security strategy: Required permission for '{tool_name}': {required_permission}"
        )

        if required_permission:
            # Check permission - pass tool instance so policy can use tool metadata
            has_permission = self.security_policy.check_permission(
                tool_name, required_permission, exec_context.tool_call.parameters,
                tool_instance=exec_context.tool
            )
            logger.debug(
                f"Security strategy: Permission check result for '{tool_name}': {has_permission}"
            )

            if not has_permission:
                error_msg = f"Permission denied for {tool_name}"
                logger.error(f"SECURITY FAILED: {error_msg}")
                return ExecutionResult(
                    success=False,
                    error=error_msg,
                    execution_time=execution_time,
                )

        # Check resource limits
        if not self.security_policy.check_resource_limits(tool_name):
            execution_time = time.time() - exec_context.start_time
            error_msg = f"Resource limits exceeded for {tool_name}"
            logger.warning(error_msg)
            return ExecutionResult(
                success=False,
                error=error_msg,
                execution_time=execution_time,
            )

        # Check path access if applicable
        if "path" in exec_context.tool_call.parameters:
            path = exec_context.tool_call.parameters["path"]
            if not self.security_policy.check_path_access(path):
                execution_time = time.time() - exec_context.start_time
                error_msg = f"Path access denied: {path}"
                logger.warning(error_msg)
                return ExecutionResult(
                    success=False,
                    error=error_msg,
                    execution_time=execution_time,
                )

        # All checks passed, proceed to next strategy
        return await self._execute_next(exec_context)

    def _get_required_permission(
        self, tool_name: str
    ) -> Optional[Any]:  # Optional[Permission]
        """Determine required permission for a tool."""
        from backend.src.core.security import Permission

        permission_map = {
            "write_file": Permission.WRITE_FILESYSTEM,
            "replace": Permission.WRITE_FILESYSTEM,
            "read_file": Permission.READ_FILESYSTEM,
            "list_directory": Permission.READ_FILESYSTEM,
            "glob": Permission.READ_FILESYSTEM,
            "search_file_content": Permission.READ_FILESYSTEM,
            "read_many_files": Permission.READ_FILESYSTEM,
            "run_shell_command": Permission.EXECUTE_COMMANDS,
            "click_ocr": Permission.COMPUTER_CONTROL,
            "keyboard": Permission.COMPUTER_CONTROL,
            "scroll": Permission.COMPUTER_CONTROL,
            "predict_click": Permission.COMPUTER_CONTROL,
        }

        return permission_map.get(tool_name)
