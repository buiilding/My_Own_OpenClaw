"""
Tool Registry for the Desktop Assistant.

This module manages the registration, discovery, and provision of tools,
including both built-in tools and community tools from the marketplace.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.src.core.security.executor import get_tool_executor
from backend.src.core.services.context_factory import ContextFactory
from backend.src.sdk.tool import Tool as SDKTool
from backend.src.tools.categorization import ToolDomain, get_categorizer
from backend.src.tools.lifecycle import ToolLifecycleManager
from backend.src.tools.marketplace_manager import MarketplaceManager, ToolMetadata
from backend.src.tools.schema_registry import SchemaRegistry

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Registry for managing available SDK tools.

    Provides tool registration, schema generation, and tool execution
    capabilities for the agent system. Supports both built-in tools and
    dynamically loaded marketplace tools.
    """

    def __init__(
        self,
        config: Any,
        tool_loader: Optional[Any] = None,
        context_factory: Optional[ContextFactory] = None,
    ):
        """
        Initialize the tool registry.

        Args:
            config: Application configuration object
            tool_loader: Optional ToolLoader instance
            context_factory: Optional ContextFactory instance (created if not provided)
        """
        self.config = config
        self.tools: Dict[str, SDKTool] = {}

        self.tool_loader = tool_loader
        self.executor = get_tool_executor()
        self.categorizer = get_categorizer()
        self.lifecycle_manager = ToolLifecycleManager(tool_registry=self)

        # New Managers
        self.marketplace_manager = MarketplaceManager(tool_loader)
        self.schema_registry = SchemaRegistry()

        # Initialize context factory (create if not provided)
        if context_factory is None:
            self.context_factory = ContextFactory(
                config=config,
                tool_registry=self,
                tool_loader=tool_loader,
            )
        else:
            self.context_factory = context_factory

        # Tool loading is deferred to async initialization
        # Call load_core_tools_async() from Container.initialize()

    @property
    def marketplace_tools(self) -> Dict[str, ToolMetadata]:
        """Backward compatibility for marketplace_tools attribute."""
        return self.marketplace_manager.marketplace_tools

    @property
    def marketplace_instances(self) -> Dict[str, SDKTool]:
        """Backward compatibility for marketplace_instances attribute."""
        return self.marketplace_manager.marketplace_instances

    def register_tool(self, tool: SDKTool) -> None:
        """
        Register a tool in the registry.

        Args:
            tool: The SDK tool to register
        """
        if tool.name in self.tools:
            logger.warning(f"Tool '{tool.name}' is already registered. Overwriting.")
        self.tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    async def load_core_tools_async(self) -> None:
        """
        Load core tools asynchronously.

        This should be called from Container.initialize() during async startup.
        """
        if not self.tool_loader:
            logger.warning("ToolLoader not initialized, skipping core tool loading")
            return

        try:
            core_tools = await self.tool_loader.load_core_tools()
            for tool in core_tools:
                self.register_tool(tool)
            logger.info(f"Loaded {len(core_tools)} core tools into registry")
        except Exception as e:
            logger.error(f"Failed to load core tools: {e}", exc_info=True)

    async def load_marketplace_tools(
        self, marketplace_dir: Path
    ) -> Dict[str, ToolMetadata]:
        """
        Load all tools from the marketplace directory using the loader.

        This method is async and should be called from an async context.
        """
        return await self.marketplace_manager.load_marketplace_tools(marketplace_dir)

    async def get_marketplace_tool_instance(self, tool_name: str) -> Optional[SDKTool]:
        """
        Get a marketplace tool instance by name (lazy loading).
        """
        return await self.marketplace_manager.get_marketplace_tool_instance(tool_name)

    def get_tool(self, name: str) -> Optional[SDKTool]:
        """
        Get a tool by name.

        Checks built-in tools first, then marketplace tools if not found.

        Args:
            name: Name of the tool to retrieve

        Returns:
            The SDK tool instance, or None if not found
        """
        # First check built-in tools
        tool = self.tools.get(name)
        if tool:
            return tool

        # Check marketplace if available
        return self.marketplace_manager.marketplace_instances.get(name)

    def get_all_tools(self) -> List[SDKTool]:
        """
        Get all registered tools (built-in + instantiated marketplace).

        Returns:
            List of all registered SDK tools
        """
        all_tools = list(self.tools.values())
        all_tools.extend(self.marketplace_manager.get_all_instances())
        return all_tools

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        names = list(self.tools.keys())
        names.extend(self.marketplace_manager.get_available_tool_names())
        return sorted(list(set(names)))

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get function declarations (schemas) for all tools.
        Uses caching to avoid regenerating schemas.

        This is used to provide tool schemas to LLMs.
        Includes both built-in tools and marketplace tools.

        Returns:
            List of function declaration dictionaries
        """
        return self.schema_registry.get_declarations(self.get_all_tools())

    def get_function_declarations_filtered(
        self, tool_names: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Get function declarations for specific tools.
        Uses caching to avoid regenerating schemas.

        Args:
            tool_names: List of tool names to include

        Returns:
            List of function declarations for the specified tools
        """
        tools = []
        for name in tool_names:
            tool = self.get_tool(name)
            if tool:
                tools.append(tool)
        return self.schema_registry.get_declarations(tools)

    def is_tool_available(self, tool_name: str) -> bool:
        """
        Check if a tool is available.

        Args:
            tool_name: Name of the tool to check

        Returns:
            True if the tool is available, False otherwise
        """
        return tool_name in self.tools or tool_name in self.marketplace_tools

    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get capabilities information for a tool.
        Uses caching to avoid regenerating schemas.

        Args:
            tool_name: Name of the tool

        Returns:
            Tool capabilities dictionary, or None if tool not found
        """
        tool = self.get_tool(tool_name)
        if tool:
            schema = self.schema_registry.get_schema(tool)
            if schema:
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": schema.get("parameters", {}),
                    "requires_context": True,
                }
        return None

    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the tool registry.

        Returns:
            Dictionary with registry statistics
        """
        all_tools_list = self.get_all_tools()
        domain_stats = self.categorizer.get_domain_statistics(all_tools_list)

        return {
            "total_tools": len(self.tools) + len(self.marketplace_instances),
            "builtin_tools": len(self.tools),
            "marketplace_tools_loaded": len(self.marketplace_instances),
            "marketplace_tools_available": len(self.marketplace_tools),
            "tool_names": self.get_tool_names(),
            "domain_statistics": {
                domain.value: count for domain, count in domain_stats.items()
            },
        }

    def get_tools_by_domain(self, domain: ToolDomain) -> List[SDKTool]:
        """
        Get all tools in a specific domain.

        Args:
            domain: Domain to filter by

        Returns:
            List of tools in the specified domain
        """
        all_tools = self.get_all_tools()
        return self.categorizer.get_tools_by_domain(all_tools, domain)

    def categorize_tool(self, tool: SDKTool) -> ToolDomain:
        """
        Categorize a tool by domain.

        Args:
            tool: Tool instance to categorize

        Returns:
            ToolDomain for the tool
        """
        return self.categorizer.categorize_tool(tool)
