"""
Tool Registry for the Desktop Assistant.

This module manages the registration, discovery, and provision of tools,
including both built-in tools and community tools from the marketplace.
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.src.tools.base import Tool, ToolResult, ToolContext

# Marketplace Discovery
from backend.src.tools.marketplace.discovery.security import SecurityScanResult
from backend.src.tools.marketplace.discovery.validator import ToolManifest

logger = logging.getLogger(__name__)


@dataclass
class ToolMetadata:
    """Metadata for a marketplace tool."""
    name: str
    version: str
    description: str
    author: str
    category: str
    permissions: List[str]
    is_destructive: bool
    tool_dir: Path
    manifest_path: Path
    security_status: SecurityScanResult
    manifest: ToolManifest


class ToolRegistry:
    """
    Registry for managing available tools.

    Provides tool registration, schema generation, and tool execution
    capabilities for the agent system. Supports both built-in tools and
    dynamically loaded marketplace tools.
    """

    def __init__(
        self,
        config: Any,
        tool_loader: Optional[Any] = None,
    ):
        """
        Initialize the tool registry.

        Args:
            config: Application configuration object
            tool_loader: Optional ToolLoader instance
        """
        self.config = config
        self.tools: Dict[str, Tool] = {}
        
        # Marketplace
        self.marketplace_tools: Dict[str, ToolMetadata] = {}
        self.marketplace_instances: Dict[str, Tool] = {}
        
        self.tool_loader = tool_loader
        if self.tool_loader:
             # Load built-ins immediately
             core_tools = self.tool_loader.load_core_tools()
             for tool in core_tools:
                 self.register_tool(tool)

    def register_tool(self, tool: Tool) -> None:
        """
        Register a tool in the registry.

        Args:
            tool: The tool to register
        """
        if tool.name in self.tools:
            logger.warning(f"Tool '{tool.name}' is already registered. Overwriting.")
        self.tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    async def load_marketplace_tools(self, marketplace_dir: Path) -> Dict[str, ToolMetadata]:
        """
        Load all tools from the marketplace directory using the loader.
        """
        if not self.tool_loader:
            logger.error("ToolLoader not initialized")
            return {}

        self.marketplace_tools = self.tool_loader.scan_marketplace_tools(marketplace_dir)
        return self.marketplace_tools

    async def get_marketplace_tool_instance(self, tool_name: str) -> Optional[Tool]:
        """
        Get a marketplace tool instance by name (lazy loading).
        """
        if tool_name not in self.marketplace_tools:
            return None

        # Return cached instance if available
        if tool_name in self.marketplace_instances:
            return self.marketplace_instances[tool_name]

        if not self.tool_loader:
            return None

        metadata = self.marketplace_tools[tool_name]
        
        tool_instance = await self.tool_loader.load_marketplace_tool(metadata)
        
        if tool_instance:
            self.marketplace_instances[tool_name] = tool_instance
            return tool_instance
            
        return None

    def get_tool(self, name: str) -> Optional[Tool]:
        """
        Get a tool by name.

        Checks built-in tools first, then marketplace tools if not found.

        Args:
            name: Name of the tool to retrieve

        Returns:
            The tool instance, or None if not found
        """
        # First check built-in tools
        tool = self.tools.get(name)
        if tool:
            return tool

        # Check marketplace if available
        if name in self.marketplace_instances:
            return self.marketplace_instances[name]
            
        return None

    def get_all_tools(self) -> List[Tool]:
        """
        Get all registered tools (built-in + instantiated marketplace).

        Returns:
            List of all registered tools
        """
        all_tools = list(self.tools.values())
        all_tools.extend(self.marketplace_instances.values())
        return all_tools

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        names = list(self.tools.keys())
        names.extend(self.marketplace_tools.keys())
        return sorted(list(set(names)))

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get function declarations (schemas) for all tools.

        This is used to provide tool schemas to LLMs.
        Includes both built-in tools and marketplace tools.

        Returns:
            List of function declaration dictionaries
        """
        declarations = []
        # Add built-in tool schemas
        for tool in self.tools.values():
            try:
                schema = tool.get_schema()
                declarations.append(schema)
            except Exception as e:
                logger.error(f"Failed to get schema for tool {tool.name}: {e}")
                continue

        # Add marketplace tool schemas if available
        for tool_name, tool in self.marketplace_instances.items():
            try:
                schema = tool.get_schema()
                declarations.append(schema)
            except Exception as e:
                logger.error(
                    f"Failed to get schema for marketplace tool {tool_name}: {e}"
                )
                continue

        return declarations

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
        declarations = []
        for name in tool_names:
            tool = self.get_tool(name)
            if tool:
                try:
                    schema = tool.get_schema()
                    declarations.append(schema)
                except Exception as e:
                    logger.error(f"Failed to get schema for tool {name}: {e}")
                    continue
        return declarations

    async def execute_tool(self, tool_name: str, **kwargs) -> ToolResult:
        """
        Execute a tool by name.

        Checks built-in tools first, then marketplace tools.

        Args:
            tool_name: Name of the tool to execute
            **kwargs: Tool parameters

        Returns:
            Tool execution result
        """
        tool = self.get_tool(tool_name)

        # If not found in built-in or instantiated marketplace tools, try to load from marketplace
        if not tool and tool_name in self.marketplace_tools:
            try:
                tool = await self.get_marketplace_tool_instance(tool_name)
            except Exception as e:
                logger.error(f"Error loading marketplace tool {tool_name}: {e}")

        if not tool:
            return ToolResult(
                success=False,
                error=f"Tool '{tool_name}' not found",
                llm_content=f"Error: Tool '{tool_name}' not found",
                return_display=f"Tool '{tool_name}' not found",
            )

        try:
            # Validate parameters
            validation_errors = tool.validate_parameters(**kwargs)
            if validation_errors:
                error_msg = (
                    f"Parameter validation failed: {', '.join(validation_errors)}"
                )
                return ToolResult(
                    success=False,
                    error=error_msg,
                    llm_content=f"Error: {error_msg}",
                    return_display=error_msg,
                )

            # Execute the tool
            logger.info(f"Executing tool {tool_name} with kwargs: {kwargs}")
            
            context = ToolContext()
            # Pass registry to context if needed (e.g. for tools calling other tools)
            context.tool_registry = self

            result = await tool.execute_async(context, **kwargs)
            return result

        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}", exc_info=True)
            return ToolResult(
                success=False,
                error=f"Tool execution failed: {str(e)}",
                llm_content=f"Error: Tool execution failed: {str(e)}",
                return_display=f"Tool execution failed: {str(e)}",
            )

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

        Args:
            tool_name: Name of the tool

        Returns:
            Tool capabilities dictionary, or None if tool not found
        """
        tool = self.get_tool(tool_name)
        if tool:
            return tool.get_capabilities()
        return None

    def get_tools_by_kind(self, kind: str) -> List[Tool]:
        """
        Get all tools of a specific kind.

        Args:
            kind: Tool kind to filter by

        Returns:
            List of tools matching the kind
        """
        all_tools = self.get_all_tools()
        return [tool for tool in all_tools if tool.kind.value == kind]

    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the tool registry.

        Returns:
            Dictionary with registry statistics
        """
        tools_by_kind = {}
        for tool in self.get_all_tools():
            kind = tool.kind.value
            tools_by_kind[kind] = tools_by_kind.get(kind, 0) + 1

        return {
            "total_tools": len(self.tools) + len(self.marketplace_instances),
            "builtin_tools": len(self.tools),
            "marketplace_tools_loaded": len(self.marketplace_instances),
            "marketplace_tools_available": len(self.marketplace_tools),
            "tools_by_kind": tools_by_kind,
            "tool_names": self.get_tool_names(),
        }


    def create_tool_registry(
    config: Any,
    marketplace_dir: Optional[Path] = None,
    tool_search_engine: Optional[Any] = None,
) -> ToolRegistry:
    """
    Create and initialize a tool registry.
    (Wrapper for backward compatibility, though usage should be updated to Container)

    Args:
        config: Application configuration
        marketplace_dir: Optional path to marketplace directory
        tool_search_engine: Optional ToolSearchEngine instance

    Returns:
        Initialized tool registry
    """
    from backend.src.tools.loader import ToolLoader
    loader = ToolLoader(config)
    # Note: marketplace_dir and tool_search_engine are handled by the caller 
    # calling load_marketplace_tools or setting attributes, as per new design.
    # This factory is a bit limited now.
    return ToolRegistry(config, tool_loader=loader)
