"""
Tool Execution Strategy Pattern.

This module implements the strategy pattern for tool execution, allowing
composable execution logic (security checks, auditing, caching, etc.).
"""
import logging
import time
from abc import ABC
from typing import Any, Dict, Optional
from pydantic import BaseModel

from backend.src.sdk.tool import Tool as SDKTool
from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult
from backend.src.llm.parser import ParsedToolCall

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
    """Result of tool execution."""
    
    def __init__(
        self,
        success: bool,
        data: Any = None,
        error: Optional[str] = None,
        execution_time: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
        tool_result_dict: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize execution result.
        
        Args:
            success: Whether execution succeeded
            data: Result data (legacy field, kept for compatibility)
            error: Error message if failed
            execution_time: Execution time in seconds
            metadata: Additional metadata
            tool_result_dict: Complete tool result dictionary (preserves all fields)
        """
        self.success = success
        self.data = data
        self.error = error
        self.execution_time = execution_time
        self.metadata = metadata or {}
        # Store the complete tool result dict to preserve all fields
        self.tool_result_dict = tool_result_dict or {}
    
    def to_tool_result(self) -> ToolResult:
        """
        Convert to ToolResult for compatibility.
        
        This method extracts llm_content and return_display from the tool result,
        following the standard tool result format where tools return dicts with
        these fields explicitly set.
        """
        # Extract from tool_result_dict first (most reliable source)
        llm_content = self.tool_result_dict.get("llm_content")
        return_display = self.tool_result_dict.get("return_display")
        
        # Fallback: try to extract from data if it's a dict (for backward compatibility)
        if llm_content is None and isinstance(self.data, dict):
            llm_content = self.data.get("llm_content")
            if return_display is None:
                return_display = self.data.get("return_display")
        
        # Construct llm_content if still missing (None, but allow empty strings)
        if llm_content is None:
            if self.error:
                llm_content = f"Error: {self.error}"
            elif isinstance(self.tool_result_dict, dict) and self.tool_result_dict:
                # Try common fields from tool result
                if "output" in self.tool_result_dict and self.tool_result_dict["output"]:
                    llm_content = self.tool_result_dict["output"]
                elif "screenshot" in self.tool_result_dict:
                    llm_content = "Screenshot captured successfully"
            elif isinstance(self.data, dict) and self.data:
                if "output" in self.data and self.data["output"]:
                    llm_content = self.data["output"]
            elif self.data:
                llm_content = str(self.data)
            # If still None, leave it None - don't use generic fallback
        
        # Construct return_display if missing
        if return_display is None:
            if self.error:
                return_display = f"Error: {self.error}"
            elif llm_content:
                return_display = llm_content
            else:
                # Last resort only for display (not for LLM)
                return_display = "Tool executed successfully"
        
        # Extract data (everything except standard fields)
        data = self.data
        if isinstance(self.tool_result_dict, dict):
            data = {k: v for k, v in self.tool_result_dict.items()
                   if k not in ["success", "error", "llm_content", "return_display", "metadata"]}
            if not data:
                data = self.tool_result_dict.copy()
                data.pop("success", None)
                data.pop("error", None)
                data.pop("llm_content", None)
                data.pop("return_display", None)
                data.pop("metadata", None)
        
        return ToolResult(
            success=self.success,
            data=data if data else None,
            error=self.error,
            llm_content=llm_content,
            return_display=return_display,
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
        
        Tools return dictionaries with standard fields:
        - success: bool
        - error: Optional[str]
        - llm_content: Optional[str] - content for LLM consumption
        - return_display: Optional[str] - content for user display
        - data: Any - additional result data
        - metadata: Optional[Dict] - additional metadata
        
        We preserve the entire result dict to avoid information loss.
        """
        try:
            result = await exec_context.tool.run(exec_context.args, exec_context.context)
            
            # Convert result to dict if needed
            if isinstance(result, dict):
                result_dict = result
            else:
                # Non-dict result - wrap it
                result_dict = {"data": result, "success": True}
            
            execution_time = time.time() - exec_context.start_time
            
            # Extract standard fields for backward compatibility
            success = result_dict.get("success", True)
            error = result_dict.get("error")
            metadata = result_dict.get("metadata")
            
            # Extract data field if present, otherwise use the whole dict (minus standard fields)
            data = result_dict.get("data")
            if data is None:
                # No explicit "data" field - extract everything except standard fields
                data = {k: v for k, v in result_dict.items()
                       if k not in ["success", "error", "llm_content", "return_display", "metadata"]}
                if not data:
                    data = None
            
            # Preserve the complete result dict for to_tool_result() to extract llm_content/return_display
            return ExecutionResult(
                success=success,
                data=data,
                error=error,
                execution_time=execution_time,
                metadata=metadata,
                tool_result_dict=result_dict,  # Preserve complete result
            )
        
        except Exception as e:
            execution_time = time.time() - exec_context.start_time
            # Sanitize any result data that might contain screenshot before logging
            # Don't log full exception context if it might contain large base64 data
            logger.error(
                f"Tool execution error for {exec_context.tool_call.tool_name}: {e}",
                exc_info=False  # Don't include full traceback to avoid logging screenshot data
            )
            return ExecutionResult(
                success=False,
                error=f"Tool execution failed: {str(e)}",
                execution_time=execution_time,
            )


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
        logger.debug(f"Security strategy: Required permission for '{tool_name}': {required_permission}")

        if required_permission:
            # Check permission
            has_permission = self.security_policy.check_permission(
                tool_name,
                required_permission,
                exec_context.tool_call.parameters
            )
            logger.debug(f"Security strategy: Permission check result for '{tool_name}': {has_permission}")

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
    
    def _get_required_permission(self, tool_name: str) -> Optional[Any]:  # Optional[Permission]
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
            logger.error(f"Available tools: {list(self.tool_registry.get_tool_names())}")
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
            logger.debug(f"Validation strategy: Tool '{tool_name}' retrieved successfully")
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
            logger.debug(f"Validation strategy: Validating parameters for '{tool_name}': {exec_context.tool_call.parameters}")
            validated_args = exec_context.tool.args_model(**exec_context.tool_call.parameters)
            exec_context.args = validated_args
            logger.debug(f"Validation strategy: Parameters validated successfully for '{tool_name}'")
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


def create_execution_chain(
    tool_registry: Any,
    security_policy: Any,
) -> ExecutionStrategy:
    """
    Create a standard execution strategy chain.
    
    Args:
        tool_registry: ToolRegistry instance
        security_policy: SecurityPolicy instance
        
    Returns:
        Root execution strategy with chain: Validation -> Security -> Audit -> Execute
    """
    # Terminal strategy (actual execution)
    execute_strategy = ExecutionStrategy()
    
    # Audit strategy
    audit_strategy = AuditExecutionStrategy(
        audit_logger=None,  # Uses global audit function
        next_strategy=execute_strategy
    )
    
    # Security strategy
    security_strategy = SecurityExecutionStrategy(
        security_policy=security_policy,
        next_strategy=audit_strategy
    )
    
    # Validation strategy (root)
    validation_strategy = ValidationExecutionStrategy(
        tool_registry=tool_registry,
        next_strategy=security_strategy
    )
    
    return validation_strategy

