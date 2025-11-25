"""
Tool Orchestrator for the Desktop Assistant.

This module coordinates tool execution, manages tool results,
and provides streaming updates during tool operations.
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.agent.core import AgentSession

from backend.src.llm.parser import ParsedResponse, ParsedToolCall
from backend.src.core.interfaces.tool import ToolResult
from backend.src.tools.registry import ToolRegistry
from backend.src.tools.execution.strategies import (
    ExecutionContext,
    create_execution_chain,
)
from backend.src.core.services.context_factory import ContextFactory

logger = logging.getLogger(__name__)


@dataclass
class ToolExecutionResult:
    """Result of executing a tool call."""

    tool_call: ParsedToolCall
    result: ToolResult
    execution_time: float
    success: bool


@dataclass
class OrchestrationResult:
    """Overall result of orchestrating multiple tool calls."""

    tool_results: List[ToolExecutionResult]
    total_execution_time: float
    all_successful: bool
    summary: str


def _dict_to_tool_result(result_dict: Dict[str, Any]) -> ToolResult:
    """
    Convert SDK tool result dict to ToolResult for compatibility.
    
    Args:
        result_dict: SDK tool result dictionary
        
    Returns:
        ToolResult instance
    """
    success = result_dict.get("success", "error" not in result_dict)
    error = result_dict.get("error")
    llm_content = result_dict.get("llm_content")
    return_display = result_dict.get("return_display")
    
    # Extract data (everything except special fields)
    data = {k: v for k, v in result_dict.items() 
            if k not in ["success", "error", "llm_content", "return_display"]}
    
    # If data is empty but we have other fields, use the whole dict as data
    if not data and result_dict:
        data = result_dict.copy()
        data.pop("success", None)
        data.pop("error", None)
        data.pop("llm_content", None)
        data.pop("return_display", None)
    # If llm_content is not provided, construct it from data
    if not llm_content:
        if error:
            llm_content = f"Error: {error}"
        elif data:
            # If we have structured data, try to find relevant fields for LLM
            if "output" in data:
                llm_content = data["output"]
            elif "screenshot" in data:
                llm_content = "Screenshot captured successfully"
            else:
                llm_content = str(data)
        else:
            llm_content = "Tool executed successfully"

    return ToolResult(
        success=success,
        data=data if data else None,
        error=error,
        llm_content=llm_content,
        return_display=return_display or llm_content,
    )


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
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool orchestrator.

        Args:
            tool_registry: Registry of available tools
            config: Application configuration
            context_factory: Optional ContextFactory instance (uses registry's factory if not provided)
        """
        self.tool_registry = tool_registry
        self.config = config
        self._execution_lock = asyncio.Lock()
        
        # Use registry's context factory if not provided
        if context_factory is None:
            self.context_factory = tool_registry.context_factory
        else:
            self.context_factory = context_factory
        
        # Initialize execution strategy chain (Phase 2)
        from backend.src.core.security import get_security_policy
        self.execution_strategy = create_execution_chain(
            tool_registry=tool_registry,
            security_policy=get_security_policy()
        )

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
                    execution_result = await self._execute_single_tool(
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
                    logger.error(
                        f"Failed to execute tool {tool_call.tool_name}: {e}",
                        exc_info=True,
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
            all_successful = all(result.success for result in results)

            summary = self._create_execution_summary(results, total_time)

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

        execution_result = await self._execute_single_tool(tool_call)
        return execution_result.result

    async def _execute_single_tool(
        self, 
        tool_call: ParsedToolCall, 
        user_id: str = "default_user", 
        session_id: str = "default_session",
        session_ref: Optional["AgentSession"] = None,
    ) -> ToolExecutionResult:
        """
        Execute a single tool call using execution strategies (Phase 2).

        Args:
            tool_call: The tool call to execute
            user_id: User ID for security and audit
            session_id: Session ID for audit

        Returns:
            ToolExecutionResult with execution details
        """
        tool_name = tool_call.tool_name
        start_time = time.time()

        logger.debug(f"Orchestrator: Starting execution of tool '{tool_name}'")
        
        try:
            # Get tool instance
            logger.debug(f"Orchestrator: Getting tool instance for '{tool_name}'")
            tool = self.tool_registry.get_tool(tool_name)
            if not tool:
                logger.debug(f"Orchestrator: Tool '{tool_name}' not found in core registry, checking marketplace")
                # Try loading marketplace tool
                if tool_name in self.tool_registry.marketplace_tools:
                    logger.debug(f"Orchestrator: Loading marketplace tool '{tool_name}'")
                    tool = await self.tool_registry.get_marketplace_tool_instance(tool_name)
                    logger.debug(f"Orchestrator: Marketplace tool loaded: {tool is not None}")
                else:
                    logger.error(f"ORCHESTRATOR FAILED: Tool '{tool_name}' not found in registry")
                    logger.error(f"Available tools: {list(self.tool_registry.get_tool_names())}")
                    logger.error(f"Marketplace tools: {list(self.tool_registry.marketplace_tools.keys())}")
            
            if not tool:
                execution_time = time.time() - start_time
                error_msg = f"Tool '{tool_name}' is not available"
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
            
            # Validate parameters
            try:
                args = tool.args_model(**tool_call.parameters)
            except Exception as e:
                execution_time = time.time() - start_time
                error_msg = f"Invalid parameters: {str(e)}"
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
            
            # Build execution context using ContextFactory
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
            
            # Execute using strategy chain (Phase 2)
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
            logger.error(
                f"Tool execution error for {tool_call.tool_name}: {e}", exc_info=True
            )
            
            error_result = ToolResult(
                success=False,
                error=f"Unexpected error executing {tool_call.tool_name}: {str(e)}",
                llm_content=f"Error: Unexpected error executing {tool_call.tool_name}: {str(e)}",
                return_display=f"Tool execution failed: {str(e)}",
            )
            
            return ToolExecutionResult(
                tool_call=tool_call,
                result=error_result,
                execution_time=execution_time,
                success=False,
            )

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
                execution_result = await self._execute_single_tool(
                    tool_call, 
                    user_id=user_id, 
                    session_id=session_id,
                    session_ref=session_ref,
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
                logger.error(f"Tool execution error: {e}", exc_info=True)

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
            "summary": self._create_execution_summary(results, total_time),
        }

    def _create_execution_summary(
        self, results: List[ToolExecutionResult], total_time: float
    ) -> str:
        """Create a summary of tool execution results."""
        if not results:
            return "No tools executed"

        total_tools = len(results)
        successful_tools = sum(1 for r in results if r.success)
        failed_tools = total_tools - successful_tools

        parts = [
            f"Executed {total_tools} tool(s) in {total_time:.2f}s",
            f"✓ {successful_tools} successful",
        ]

        if failed_tools > 0:
            parts.append(f"✗ {failed_tools} failed")

        return " | ".join(parts)

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
        # Check if tool exists
        if not self.tool_registry.is_tool_available(tool_call.tool_name):
            return False, f"Tool '{tool_call.tool_name}' is not available"

        # Get tool and validate parameters using Pydantic
        tool = self.tool_registry.get_tool(tool_call.tool_name)
        if not tool:
            return False, f"Tool '{tool_call.tool_name}' could not be retrieved"

        # Validate parameters using Pydantic
        try:
            tool.args_model(**tool_call.parameters)
            return True, ""
        except Exception as e:
            error_msg = f"Parameter validation failed: {str(e)}"
            return False, error_msg

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
                return await self._execute_single_tool(
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

