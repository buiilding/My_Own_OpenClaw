"""
Tool Registry for the Desktop Assistant.

This module manages the registration and provision of tool schemas for the LLM.
In the new architecture, most tools are executed on the frontend, and the backend
only needs their definitions.
"""

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.core.infrastructure.cache import CacheManager
    from backend.src.sdk.tool import Tool as SDKTool
    from backend.src.core.services.context_factory import ContextFactory
from backend.src.tools.schema_registry import SchemaRegistry
from backend.src.tools.remote import get_all_remote_tools

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Registry for managing tools in the Desktop Assistant.
    
    Refactored to support the new architecture where tool execution is delegated 
    to the frontend. It now primarily serves as a provider of tool schemas
    and a registry of remote tool stubs.
    """

    def __init__(
        self,
        config: Any,
        cache_manager: "CacheManager",
        context_factory: Optional["ContextFactory"] = None,
    ):
        """
        Initialize the tool registry.

        Args:
            config: Application configuration object
            cache_manager: CacheManager instance
            context_factory: Optional ContextFactory instance
        """
        self.config = config
        self.tools: Dict[str, "SDKTool"] = {}
        self.schema_registry = SchemaRegistry(cache_manager=cache_manager)

        # Initialize context factory (create if not provided)
        if context_factory is None:
            from backend.src.core.services.context_factory import ContextFactory

            self.context_factory = ContextFactory(
                config=config,
                tool_registry=self,
            )
        else:
            self.context_factory = context_factory

        # Register remote tools by default
        self._register_remote_tools()

    def _register_remote_tools(self) -> None:
        """Register all remote tools from the remote module."""
        remote_tools = get_all_remote_tools()
        for name, tool_class in remote_tools.items():
            try:
                tool_instance = tool_class()
                self.register_tool(tool_instance)
                logger.debug(f"Registered remote tool: {name}")
            except Exception as e:
                logger.error(f"Failed to register remote tool {name}: {e}")

    def register_tool(self, tool: "SDKTool") -> None:
        """
        Register a tool in the registry.

        Args:
            tool: The SDK tool to register
        """
        if tool.name in self.tools:
            logger.warning(f"Tool '{tool.name}' is already registered. Overwriting.")
        self.tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional["SDKTool"]:
        """
        Get a tool by name.

        Args:
            name: Name of the tool to retrieve

        Returns:
            The SDK tool instance, or None if not found
        """
        return self.tools.get(name)

    def get_all_tools(self) -> List["SDKTool"]:
        """
        Get all registered tools.

        Returns:
            List of all registered SDK tools
        """
        return list(self.tools.values())

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        return sorted(list(self.tools.keys()))

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get function declarations (schemas) for all tools.

        Returns:
            List of function declaration dictionaries
        """
        return self.schema_registry.get_declarations(self.get_all_tools())

    def get_function_declarations_filtered(
        self, tool_names: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Get function declarations for specific tools.

        Args:
            tool_names: List of tool names to include

        Returns:
            List of function declarations for the specified tools
        """
        filtered_tools = [t for t in self.get_all_tools() if t.name in tool_names]
        return self.schema_registry.get_declarations(filtered_tools)

    def is_tool_available(self, tool_name: str) -> bool:
        """Check if a tool is available."""
        return tool_name in self.tools

    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get capabilities information for a tool.

        Args:
            tool_name: Name of the tool

        Returns:
            Tool capabilities dictionary, or None if tool not found
        """
        tool = self.get_tool(tool_name)
        if tool:
            schema = self.schema_registry.get_schema(tool)
            if schema:
                function_schema = schema.get("function", {})
                parameters = (
                    function_schema.get("parameters", {})
                    if isinstance(function_schema, dict)
                    else {}
                )
                return {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": parameters,
                    "requires_context": True,
                }
        return None
