"""
Advanced Tool Template

Comprehensive template for complex tools with full feature support:
- Parameter validation
- Capabilities declaration
- Memory payloads
- Error recovery
- Configuration options

Replace with your specific tool logic and requirements.
"""

from backend.tools.base import Tool, ToolContext, ToolResult, ToolExecutionError, Kind
from backend.config import AppServices
from typing import Optional, Dict, Any, List
import asyncio
import time
import logging

logger = logging.getLogger(__name__)


class ToolName(Tool):
    """
    Advanced tool with full feature support.

    This template demonstrates advanced patterns for tool development including:
    - Comprehensive parameter validation
    - Capabilities declaration
    - Memory payload generation
    - Error recovery strategies
    - Performance monitoring
    """

    def __init__(self, services: AppServices, config: Optional[Dict[str, Any]] = None):
        super().__init__(
            name="tool_name",
            description="Advanced tool with comprehensive features",
            kind=Tool.Kind.EXECUTE
        )
        self.services = services
        self.config = config or {}
        self.max_retries = self.config.get('max_retries', 3)
        self.timeout = self.config.get('timeout', 30)

    @property
    def name(self) -> str:
        return "tool_name"

    @property
    def description(self) -> str:
        return ("Advanced tool that performs complex operations with "
                "validation, error handling, and memory support")

    @property
    def kind(self) -> Kind:
        return Kind.EXECUTE

    def validate_parameters(self, **kwargs) -> List[str]:
        """
        Comprehensive parameter validation.

        Args:
            **kwargs: Tool parameters to validate

        Returns:
            List of validation error messages
        """
        errors = []

        # Required parameter validation
        if 'required_param' not in kwargs:
            errors.append("required_param is required")

        # Type validation
        if 'count' in kwargs and not isinstance(kwargs['count'], int):
            errors.append("count must be an integer")

        if 'count' in kwargs and kwargs['count'] < 0:
            errors.append("count must be non-negative")

        # Custom business logic validation
        if 'operation' in kwargs:
            valid_operations = ['create', 'update', 'delete']
            if kwargs['operation'] not in valid_operations:
                errors.append(f"operation must be one of: {', '.join(valid_operations)}")

        return errors

    def get_capabilities(self) -> Dict[str, Any]:
        """
        Declare tool capabilities for advanced features.

        Returns:
            Dictionary of tool capabilities
        """
        return {
            "name": self.name,
            "description": self.description,
            "kind": self.kind.value,
            "confirmation_required": True,  # Requires user approval
            "destructive": False,           # Can modify system state
            "timeout_seconds": self.timeout,
            "supported_platforms": ["windows", "linux", "macos"],
            "max_retries": self.max_retries,
            "requires_network": False,
            "batch_support": True,
        }

    async def execute_async(
        self,
        context: ToolContext,
        required_param: str,
        operation: str = "create",
        count: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> ToolResult:
        """
        Execute complex tool operation with full error handling.

        Args:
            context: Tool execution context
            required_param: Required string parameter
            operation: Operation type (create/update/delete)
            count: Optional numeric parameter
            options: Additional options dictionary

        Returns:
            ToolResult with comprehensive response
        """
        start_time = time.time()

        try:
            # Pre-execution validation (beyond parameter validation)
            await self._validate_execution_context(context, required_param)

            # Execute with retry logic
            result_data = await self._execute_with_retry(
                required_param, operation, count, options
            )

            # Generate memory payload for agent learning
            memory_payload = self._generate_memory_payload(
                operation, required_param, result_data, start_time
            )

            return ToolResult(
                success=True,
                llm_content=f"Successfully completed {operation} operation on {required_param}",
                return_display=self._format_display_result(result_data),
                data=result_data,
                metadata={
                    "execution_time": time.time() - start_time,
                    "operation": operation,
                    "item_count": count
                },
                memory_payload=memory_payload
            )

        except ToolExecutionError as e:
            logger.error(f"Tool execution failed: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=str(e),
                llm_content=f"Error: {str(e)}",
                return_display=f"Failed: {str(e)}",
                metadata={"execution_time": time.time() - start_time}
            )
        except Exception as e:
            logger.error(f"Unexpected error in {self.name}: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Unexpected error: {str(e)}",
                llm_content=f"Error: Unexpected failure occurred",
                return_display=f"Unexpected Error: {str(e)}",
                metadata={"execution_time": time.time() - start_time}
            )

    async def _validate_execution_context(self, context: ToolContext, param: str) -> None:
        """
        Validate execution context before running tool.

        Args:
            context: Tool execution context
            param: Main parameter to validate

        Raises:
            ToolExecutionError: If validation fails
        """
        # Example: Check if operation is allowed in current context
        if context.user_permissions and 'admin' not in context.user_permissions:
            # Check if this operation requires admin permissions
            if param.startswith('system_'):
                raise ToolExecutionError("Admin permissions required for system operations")

        # Additional context validation logic here
        if len(param) > 1000:
            raise ToolExecutionError("Parameter too long (max 1000 characters)")

    async def _execute_with_retry(
        self,
        param: str,
        operation: str,
        count: Optional[int],
        options: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Execute operation with retry logic.

        Args:
            param: Main parameter
            operation: Operation type
            count: Optional count
            options: Additional options

        Returns:
            Operation result data
        """
        last_error = None

        for attempt in range(self.max_retries):
            try:
                # Your main tool logic here
                result = await self._perform_operation(param, operation, count, options)

                # Validate result
                if not self._validate_result(result):
                    raise ToolExecutionError("Operation result validation failed")

                return result

            except Exception as e:
                last_error = e
                logger.warning(f"Attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(0.5 * (2 ** attempt))  # Exponential backoff

        raise ToolExecutionError(f"Operation failed after {self.max_retries} attempts: {last_error}")

    async def _perform_operation(
        self,
        param: str,
        operation: str,
        count: Optional[int],
        options: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Core operation logic.

        Args:
            param: Main parameter
            operation: Operation type
            count: Optional count
            options: Additional options

        Returns:
            Operation result
        """
        # Implement your actual tool logic here
        # This is where the real work happens

        # Example implementation
        result = {
            "operation": operation,
            "parameter": param,
            "count": count or 0,
            "timestamp": time.time(),
            "success": True
        }

        if options:
            result["options_used"] = list(options.keys())

        return result

    def _validate_result(self, result: Dict[str, Any]) -> bool:
        """
        Validate operation result.

        Args:
            result: Operation result to validate

        Returns:
            True if result is valid
        """
        required_fields = ["operation", "parameter", "timestamp"]
        return all(field in result for field in required_fields)

    def _generate_memory_payload(
        self,
        operation: str,
        param: str,
        result: Dict[str, Any],
        start_time: float
    ) -> Dict[str, Any]:
        """
        Generate memory payload for agent learning.

        Args:
            operation: Operation performed
            param: Main parameter
            result: Operation result
            start_time: Execution start time

        Returns:
            Memory payload dictionary
        """
        return {
            "action": f"Performed {operation} operation",
            "tool": self.name,
            "parameter": param,
            "operation_type": operation,
            "success": True,
            "execution_time": time.time() - start_time,
            "result_summary": f"Processed {result.get('count', 0)} items",
            "timestamp": time.time()
        }

    def _format_display_result(self, result: Dict[str, Any]) -> str:
        """
        Format result for user display.

        Args:
            result: Operation result

        Returns:
            Formatted display string
        """
        operation = result.get('operation', 'unknown')
        param = result.get('parameter', 'unknown')
        count = result.get('count', 0)

        return f"{operation.title()} operation completed on '{param}' ({count} items processed)"
