"""
Run Marketplace Tool.

Tool for executing marketplace tools with arbitrary parameters.
"""

import logging
from typing import Any, Dict, Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)

# Optional marketplace imports
try:
    from backend.marketplace.registry import MarketplaceRegistry
except ImportError:
    MarketplaceRegistry = None


class RunMarketplaceTool(Tool):
    """Tool for executing marketplace tools."""

    def __init__(self, config: Any, marketplace_registry: Optional[Any] = None):
        """
        Initialize the run marketplace tool.

        Args:
            config: AppServices instance (dependency injection)
            marketplace_registry: Optional MarketplaceRegistry instance
        """
        super().__init__(
            name="run_marketplace_tool",
            description="Execute a marketplace tool with the specified parameters. The tool must be installed first using install_marketplace_tool.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.marketplace_registry = marketplace_registry

    async def execute_async(
        self,
        context: ToolContext,
        tool_name: str,
        user_query: str,
        **kwargs
    ) -> ToolResult:
        """
        Execute the run marketplace tool.

        Args:
            context: Tool execution context (includes tool_registry)
            tool_name: Name of the marketplace tool to run
            user_query: The user's query/request for the marketplace tool
            **kwargs: Additional parameters to pass to the marketplace tool

        Returns:
            ToolResult with execution results
        """
        try:
            if not tool_name or not tool_name.strip():
                return ToolResult(
                    success=False,
                    error="tool_name parameter is required",
                    llm_content="Error: tool_name parameter is required",
                    return_display="Error: tool_name parameter is required",
                )

            if not user_query or not user_query.strip():
                return ToolResult(
                    success=False,
                    error="user_query parameter is required",
                    llm_content="Error: user_query parameter is required",
                    return_display="Error: user_query parameter is required",
                )

            if self.marketplace_registry is None:
                return ToolResult(
                    success=False,
                    error="Marketplace system is not available",
                    llm_content="Error: Marketplace system is not available. The marketplace may not be initialized.",
                    return_display="Marketplace system is not available",
                )

            logger.info(f"Running marketplace tool: {tool_name} with query: {user_query}")

            # Check if tool exists and is available
            if not self.marketplace_registry.has_tool(tool_name):
                available_tools = list(self.marketplace_registry.list_tools())
                return ToolResult(
                    success=False,
                    error=f"Tool '{tool_name}' not found in marketplace",
                    llm_content=f"Error: Tool '{tool_name}' not found in marketplace. Available tools: {', '.join(available_tools[:10])}{'...' if len(available_tools) > 10 else ''}",
                    return_display=f"Tool '{tool_name}' not found in marketplace",
                )

            # Get tool instance
            tool_instance = await self.marketplace_registry.get_tool_instance(tool_name)

            if tool_instance is None:
                return ToolResult(
                    success=False,
                    error=f"Tool '{tool_name}' is not installed or failed to load",
                    llm_content=f"Error: Tool '{tool_name}' is not installed or failed to load. Try installing it first with install_marketplace_tool.",
                    return_display=f"Tool '{tool_name}' is not available",
                )

            # Execute the marketplace tool
            # Marketplace tools expect a 'task' parameter, but we'll pass the user_query
            # and any additional kwargs
            execution_params = {"task": user_query}
            execution_params.update(kwargs)

            logger.info(f"Executing marketplace tool {tool_name} with params: {execution_params}")

            # Execute the tool
            result = await tool_instance.execute_async(context, **execution_params)

            # Wrap the result to indicate it came from a marketplace tool
            wrapped_content = f"🏪 **Marketplace Tool Result** ({tool_name})\n\n{result.llm_content}"

            return ToolResult(
                success=result.success,
                data={
                    "marketplace_tool": tool_name,
                    "original_result": result.data,
                    "execution_params": execution_params,
                },
                llm_content=wrapped_content,
                return_display=f"Marketplace tool '{tool_name}': {result.return_display}",
                error=result.error,
                metadata={
                    "marketplace_tool": tool_name,
                    "tool_success": result.success,
                    **(result.metadata or {}),
                }
            )

        except Exception as e:
            logger.error(f"Error in run marketplace tool: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Marketplace tool execution failed: {str(e)}",
                llm_content=f"Error: Marketplace tool execution failed: {str(e)}",
                return_display=f"Tool execution failed: {str(e)}",
            )
