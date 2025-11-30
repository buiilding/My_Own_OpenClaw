"""
Tool Execution Engine.

Handles the core execution logic for individual tool calls, including
tool retrieval, validation, context creation, and execution via strategy chain.
"""
import logging
import time
from typing import TYPE_CHECKING, Any, Dict, Optional

from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.parser import ParsedToolCall
from backend.src.tools.execution.strategies import ExecutionContext, ExecutionStrategy
from backend.src.tools.execution.types import ToolExecutionResult
from backend.src.tools.registry import ToolRegistry

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

logger = logging.getLogger(__name__)


class ToolExecutionEngine:
    """
    Engine for executing individual tool calls.

    Handles tool retrieval, parameter validation, context creation,
    and execution via the strategy chain. Separates execution logic
    from orchestration concerns.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        context_factory: ContextFactory,
        execution_strategy: ExecutionStrategy,
    ):
        """
        Initialize the execution engine.

        Args:
            tool_registry: Registry for tool lookup
            context_factory: Factory for creating tool execution contexts
            execution_strategy: Strategy chain for executing tools
        """
        self.tool_registry = tool_registry
        self.context_factory = context_factory
        self.execution_strategy = execution_strategy

    async def execute(
        self,
        tool_call: ParsedToolCall,
        user_id: str = "default_user",
        session_id: str = "default_session",
        session_ref: Optional["AgentSession"] = None,
    ) -> ToolExecutionResult:
        """
        Execute a single tool call.

        Args:
            tool_call: The tool call to execute
            user_id: User ID for security and audit
            session_id: Session ID for audit
            session_ref: Optional session reference for context

        Returns:
            ToolExecutionResult with execution details
        """
        tool_name = tool_call.tool_name
        start_time = time.time()

        logger.debug(f"ExecutionEngine: Starting execution of tool '{tool_name}'")

        try:
            # Get tool instance
            tool = await self._get_tool_instance(tool_name)
            if not tool:
                execution_time = time.time() - start_time
                error_msg = f"Tool '{tool_name}' is not available"
                return self._create_error_result(tool_call, error_msg, execution_time)

            # Validate parameters
            try:
                args = tool.args_model(**tool_call.parameters)
            except Exception as e:
                execution_time = time.time() - start_time
                error_msg = f"Invalid parameters: {str(e)}"
                return self._create_error_result(tool_call, error_msg, execution_time)

            # Build execution context
            context = self.context_factory.create_tool_context(
                user_id=user_id,
                session_id=session_id,
                session_ref=session_ref,
            )

            exec_context = ExecutionContext(
                tool_call=tool_call,
                tool=tool,
                args=args,
                context=context,
                user_id=user_id,
                session_id=session_id,
            )

            # Execute using strategy chain
            exec_result = await self.execution_strategy.execute(exec_context)

            # Convert to ToolResult
            result = exec_result.to_tool_result()

            return ToolExecutionResult(
                tool_call=tool_call,
                result=result,
                execution_time=exec_result.execution_time,
                success=exec_result.success,
            )

        except Exception as e:
            execution_time = time.time() - start_time
            # Don't log full exception context to avoid logging screenshot data
            logger.error(
                f"Tool execution error for {tool_call.tool_name}: {e}", exc_info=False
            )

            error_msg = f"Unexpected error executing {tool_call.tool_name}: {str(e)}"
            return self._create_error_result(tool_call, error_msg, execution_time)

    async def execute_tool_by_name(
        self, tool_name: str, parameters: Optional[Dict[str, Any]] = None, **kwargs
    ) -> Dict[str, Any]:
        """
        Convenience method to execute a tool by name (matching ToolExecutor interface).

        This method provides backward compatibility with the old ToolExecutor interface,
        allowing code to execute tools using tool_name and parameters dict instead of
        ParsedToolCall objects.

        Args:
            tool_name: Name of the tool to execute
            parameters: Tool parameters (dict)
            **kwargs: Additional context parameters (user_id, session_id, session_ref, workspace_root)

        Returns:
            Dictionary with execution result (success, data, error, llm_content, etc.)
        """
        # Create a ParsedToolCall from tool_name and parameters
        tool_call = ParsedToolCall(
            tool_name=tool_name,
            parameters=parameters or {},
            raw_call=f"{tool_name}({parameters or {}})",
            confidence=1.0,
        )

        # Extract context parameters from kwargs
        user_id = kwargs.get("user_id", "default_user")
        session_id = kwargs.get("session_id", "default_session")
        session_ref = kwargs.get("session_ref")

        # Execute using the main execute method
        execution_result = await self.execute(
            tool_call=tool_call,
            user_id=user_id,
            session_id=session_id,
            session_ref=session_ref,
        )

        # Convert ToolExecutionResult to dict format (matching ToolExecutor interface)
        result = execution_result.result

        # Build result dict
        result_dict: Dict[str, Any] = {
            "success": execution_result.success,
        }

        if result.error:
            result_dict["error"] = result.error
            result_dict["llm_content"] = result.llm_content or f"Error: {result.error}"
            result_dict["return_display"] = result.return_display or result.error
        else:
            # Success case
            if result.data is not None:
                result_dict["data"] = result.data
                # If data is a dict, merge its keys into result_dict for convenience
                if isinstance(result.data, dict):
                    result_dict.update(result.data)

            if result.llm_content:
                result_dict["llm_content"] = result.llm_content
            if result.return_display:
                result_dict["return_display"] = result.return_display
            if result.metadata:
                result_dict["metadata"] = result.metadata
            if result.artifacts:
                result_dict.update(result.artifacts)

        return result_dict

    async def _get_tool_instance(self, tool_name: str):
        """
        Get tool instance from registry, loading marketplace tool if needed.

        Args:
            tool_name: Name of the tool

        Returns:
            Tool instance or None if not found
        """
        logger.debug(f"ExecutionEngine: Getting tool instance for '{tool_name}'")
        tool = self.tool_registry.get_tool(tool_name)

        if not tool:
            logger.debug(
                f"ExecutionEngine: Tool '{tool_name}' not found in core registry, "
                "checking marketplace"
            )
            # Try loading marketplace tool
            if tool_name in self.tool_registry.marketplace_tools:
                logger.debug(f"ExecutionEngine: Loading marketplace tool '{tool_name}'")
                tool = await self.tool_registry.get_marketplace_tool_instance(tool_name)
                logger.debug(
                    f"ExecutionEngine: Marketplace tool loaded: {tool is not None}"
                )
            else:
                logger.error(
                    f"EXECUTION ENGINE FAILED: Tool '{tool_name}' not found in registry"
                )
                logger.error(
                    f"Available tools: {list(self.tool_registry.get_tool_names())}"
                )
                logger.error(
                    f"Marketplace tools: "
                    f"{list(self.tool_registry.marketplace_tools.keys())}"
                )

        return tool

    def _create_error_result(
        self,
        tool_call: ParsedToolCall,
        error_msg: str,
        execution_time: float,
    ) -> ToolExecutionResult:
        """
        Create an error ToolExecutionResult.

        Args:
            tool_call: The tool call that failed
            error_msg: Error message
            execution_time: Execution time

        Returns:
            ToolExecutionResult with error details
        """
        return ToolExecutionResult(
            tool_call=tool_call,
            result=ToolResult(
                success=False,
                error=error_msg,
                llm_content=f"Error: {error_msg}",
                return_display=error_msg,
            ),
            execution_time=execution_time,
            success=False,
        )


def create_execution_engine_from_registry(
    tool_registry: ToolRegistry,
    context_factory: Optional[ContextFactory] = None,
) -> ToolExecutionEngine:
    """
    Create a ToolExecutionEngine from a ToolRegistry.

    This helper function provides a convenient way to create a ToolExecutionEngine
    when you only have access to a ToolRegistry. It creates the necessary execution
    strategy chain and uses the registry's context factory if not provided.

    Args:
        tool_registry: ToolRegistry instance
        context_factory: Optional ContextFactory (uses registry's factory if not provided)

    Returns:
        Configured ToolExecutionEngine instance
    """
    from backend.src.core.security import get_security_policy
    from backend.src.tools.execution.strategies.chain import create_execution_chain

    # Use registry's context factory if not provided
    if context_factory is None:
        context_factory = tool_registry.context_factory

    # Create execution strategy chain
    execution_strategy = create_execution_chain(
        tool_registry=tool_registry, security_policy=get_security_policy()
    )

    # Create and return execution engine
    return ToolExecutionEngine(
        tool_registry=tool_registry,
        context_factory=context_factory,
        execution_strategy=execution_strategy,
    )
