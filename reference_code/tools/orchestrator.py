"""
Tool Orchestrator for the Desktop Assistant.

This module coordinates tool execution, manages tool results,
and provides streaming updates during tool operations.
"""

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any, AsyncGenerator, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

from backend.src.core.interfaces.tool import ToolResult
from backend.src.core.services.context_factory import ContextFactory
from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.tools.execution.batch_executor import BatchExecutor
from backend.src.tools.execution.engine import ToolExecutionEngine
from backend.src.tools.execution.progress_tracker import ProgressTracker
from backend.src.tools.execution.strategies import create_execution_chain
from backend.src.tools.execution.summary import create_execution_summary
from backend.src.tools.execution.types import OrchestrationResult, ToolExecutionResult
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.validation.validator import ToolValidator

logger = logging.getLogger(__name__)


class ToolOrchestrator:
    """
    Orchestrates the execution of multiple tool calls from LLM responses.

    Manages tool execution order, error handling, result aggregation,
    and provides real-time progress updates.
    """

    def __init__(
        self,
        tool_registry: ToolRegistry,
        config: Any,
        security_policy: Optional[Any] = None,
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool orchestrator.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration
            security_policy: SecurityPolicy instance (creates default if not provided)
            context_factory: Optional ContextFactory instance (uses registry's factory if not provided)
        """
        from backend.src.core.security import SecurityPolicy
        
        self.tool_registry = tool_registry
        self.config = config
        self._execution_lock = asyncio.Lock()

        # Use registry's context factory if not provided
        if context_factory is None:
            self.context_factory = tool_registry.context_factory
        else:
            self.context_factory = context_factory

        # SecurityPolicy is required - create default if not provided
        if security_policy is None:
            security_policy = SecurityPolicy(tool_registry=tool_registry)

        # Initialize execution strategy chain
        execution_strategy = create_execution_chain(
            tool_registry=tool_registry, security_policy=security_policy
        )

        # Initialize execution engine
        self.execution_engine = ToolExecutionEngine(
            tool_registry=tool_registry,
            context_factory=self.context_factory,
            execution_strategy=execution_strategy,
        )

        # Initialize progress tracker and batch executor
        self.progress_tracker = ProgressTracker(self, config)
        self.batch_executor = BatchExecutor(self, config)

        # Initialize validator
        self.validator = ToolValidator(tool_registry)

    async def execute_tools_from_response(
        self,
        parsed_response: ParsedResponse,
        user_id: str = "default_user",
        session_id: str = "default_session",
        session_ref: Optional["AgentSession"] = None,
    ) -> OrchestrationResult:
        """
        Execute all tool calls from a parsed LLM response.

        Args:
            parsed_response: Parsed response containing tool calls

        Returns:
            OrchestrationResult with execution results
        """
        if not parsed_response.has_tool_calls:
            return OrchestrationResult(
                tool_results=[],
                total_execution_time=0.0,
                all_successful=True,
                summary="No tool calls to execute",
            )

        start_time = time.time()

        async with self._execution_lock:
            results = []

            # Execute tools sequentially (for now)
            # TODO: Add parallel execution for independent tools
            for tool_call in parsed_response.tool_calls:
                try:
                    execution_result = await self.execution_engine.execute(
                        tool_call,
                        user_id=user_id,
                        session_id=session_id,
                        session_ref=session_ref,
                    )
                    results.append(execution_result)

                    # Log execution result
                    logger.info(
                        f"Tool {tool_call.tool_name} executed in {execution_result.execution_time:.2f}s "
                        f"with {'success' if execution_result.success else 'failure'}"
                    )

                except Exception as e:
                    # Don't log full exception context to avoid logging screenshot data in traceback
                    logger.error(
                        f"Failed to execute tool {tool_call.tool_name}: {e}",
                        exc_info=False,
                    )

                    # Create error result
                    error_result = ToolExecutionResult(
                        tool_call=tool_call,
                        result=ToolResult(
                            success=False,
                            error=f"Tool execution failed: {str(e)}",
                            llm_content=f"Error executing {tool_call.tool_name}: {str(e)}",
                            return_display=f"Tool execution failed: {str(e)}",
                        ),
                        execution_time=0.0,
                        success=False,
                    )
                    results.append(error_result)

            total_time = time.time() - start_time

            # Aggregate results (inlined from ResultAggregator)
            all_successful = all(result.success for result in results)
            summary = create_execution_summary(results, total_time)

            return OrchestrationResult(
                tool_results=results,
                total_execution_time=total_time,
                all_successful=all_successful,
                summary=summary,
            )

    async def execute_single_tool(
        self, tool_name: str, parameters: Dict[str, Any]
    ) -> ToolResult:
        """
        Execute a single tool by name with given parameters.

        Args:
            tool_name: Name of the tool to execute
            parameters: Tool parameters

        Returns:
            Tool execution result
        """
        tool_call = ParsedToolCall(
            tool_name=tool_name,
            parameters=parameters,
            raw_call=f"{tool_name}({parameters})",
            confidence=1.0,
        )

        execution_result = await self.execution_engine.execute(tool_call)
        return execution_result.result

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
        async for event in self.progress_tracker.execute_tools_with_progress(
            parsed_response, progress_callback
        ):
            yield event

    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get information about all available tools.

        Returns:
            List of tool information dictionaries
        """
        tools = []
        for tool_name in self.tool_registry.get_tool_names():
            capabilities = self.tool_registry.get_tool_capabilities(tool_name)
            if capabilities:
                tools.append(capabilities)
        return tools

    def validate_tool_call(self, tool_call: ParsedToolCall) -> Tuple[bool, str]:
        """
        Validate a tool call before execution.

        Args:
            tool_call: The tool call to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        return self.validator.validate_tool_call(tool_call)

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
        return await self.batch_executor.execute_tools_batch(tool_calls, max_concurrent)
