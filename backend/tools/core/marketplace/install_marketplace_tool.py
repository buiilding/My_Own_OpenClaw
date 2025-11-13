"""
Install Marketplace Tool.

Tool for installing/loading marketplace tools into the tool registry.
"""

import logging
from typing import Any, Optional

from backend.tools.base import Kind, Tool, ToolContext, ToolResult

logger = logging.getLogger(__name__)

# Optional marketplace imports
try:
    from backend.marketplace.registry import MarketplaceRegistry
except ImportError:
    MarketplaceRegistry = None


class InstallMarketplaceTool(Tool):
    """Tool for installing/loading marketplace tools."""

    def __init__(self, config: Any, marketplace_registry: Optional[Any] = None):
        """
        Initialize the install marketplace tool.

        Args:
            config: AppServices instance (dependency injection)
            marketplace_registry: Optional MarketplaceRegistry instance
        """
        super().__init__(
            name="install_marketplace_tool",
            description="Install or load a marketplace tool into the current session. This makes the tool available for use in subsequent tool calls.",
            kind=Kind.EXECUTE,
        )
        self.config = config
        self.marketplace_registry = marketplace_registry

    async def execute_async(
        self,
        context: ToolContext,
        tool_name: str,
    ) -> ToolResult:
        """
        Execute the install marketplace tool.

        Args:
            context: Tool execution context
            tool_name: Name of the marketplace tool to install

        Returns:
            ToolResult with installation results
        """
        try:
            if not tool_name or not tool_name.strip():
                return ToolResult(
                    success=False,
                    error="tool_name parameter is required",
                    llm_content="Error: tool_name parameter is required",
                    return_display="Error: tool_name parameter is required",
                )

            if self.marketplace_registry is None:
                return ToolResult(
                    success=False,
                    error="Marketplace system is not available",
                    llm_content="Error: Marketplace system is not available. The marketplace may not be initialized.",
                    return_display="Marketplace system is not available",
                )

            logger.info(f"Installing marketplace tool: {tool_name}")

            # Check if tool exists in marketplace
            if not self.marketplace_registry.has_tool(tool_name):
                available_tools = list(self.marketplace_registry.list_tools())
                return ToolResult(
                    success=False,
                    error=f"Tool '{tool_name}' not found in marketplace",
                    llm_content=f"Error: Tool '{tool_name}' not found in marketplace. Available tools: {', '.join(available_tools[:10])}{'...' if len(available_tools) > 10 else ''}",
                    return_display=f"Tool '{tool_name}' not found in marketplace",
                )

            # Try to get tool instance (this will load/instantiate it)
            tool_instance = await self.marketplace_registry.get_tool_instance(tool_name)

            if tool_instance is None:
                return ToolResult(
                    success=False,
                    error=f"Failed to install tool '{tool_name}'",
                    llm_content=f"Error: Failed to install tool '{tool_name}'. The tool may have security issues or initialization errors.",
                    return_display=f"Failed to install tool '{tool_name}'",
                )

            # Get tool metadata for confirmation
            metadata = self.marketplace_registry.get_tool_metadata(tool_name)
            if metadata:
                content = f"✅ Successfully installed marketplace tool: {tool_name}\n\n"
                content += f"**Description**: {metadata.description}\n"
                content += f"**Category**: {metadata.category}\n"
                content += f"**Author**: {metadata.author}\n"
                content += f"**Version**: {metadata.version}\n"

                if metadata.permissions:
                    content += f"**Permissions**: {', '.join(metadata.permissions)}\n"

                content += f"\nThe tool is now available for use. You can call it directly using its name '{tool_name}' in subsequent tool calls."

                return ToolResult(
                    success=True,
                    data={
                        "tool_name": tool_name,
                        "installed": True,
                        "metadata": {
                            "description": metadata.description,
                            "category": metadata.category,
                            "author": metadata.author,
                            "version": metadata.version,
                            "permissions": metadata.permissions,
                        }
                    },
                    llm_content=content,
                    return_display=f"Successfully installed tool '{tool_name}'",
                )
            else:
                return ToolResult(
                    success=True,
                    data={"tool_name": tool_name, "installed": True},
                    llm_content=f"✅ Successfully installed marketplace tool: {tool_name}\n\nThe tool is now available for use.",
                    return_display=f"Successfully installed tool '{tool_name}'",
                )

        except Exception as e:
            logger.error(f"Error in install marketplace tool: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Tool installation failed: {str(e)}",
                llm_content=f"Error: Tool installation failed: {str(e)}",
                return_display=f"Installation failed: {str(e)}",
            )
