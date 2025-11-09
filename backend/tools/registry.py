"""
Tool Registry for the Desktop Assistant.

This module manages the registration, discovery, and provision of tools
to the LLM, including schema generation and tool filtering.
"""

import logging
from typing import Any, Dict, List, Optional

from backend.config import AppServices
from backend.tools.base import Tool, ToolBuilder, ToolInvocation, ToolResult
from backend.tools.core.computer import (
    KeyboardTool,
    MouseTool,
    ScreenshotTool,
    ScrollTool,
)
from backend.tools.core.filesystem import (
    GlobTool,
    ListDirectoryTool,
    ReadFileTool,
    ReadManyFilesTool,
    ReplaceTool,
    SearchFileContentTool,
    WriteFileTool,
)
from backend.tools.core.system.shell_tool import ShellTool

logger = logging.getLogger(__name__)


class ToolRegistry:
    """
    Registry for managing available tools.

    Provides tool registration, schema generation, and tool execution
    capabilities for the agent system.
    """

    def __init__(self, config: Any):
        """
        Initialize the tool registry.

        Args:
            config: Application configuration object
        """
        self.config = config
        self.services = AppServices(config)
        self.tools: Dict[str, Tool] = {}
        self._register_builtin_tools()

    def _register_builtin_tools(self) -> None:
        """Register all built-in tools."""
        # File system tools
        self.register_tool(ListDirectoryTool(self.services))
        self.register_tool(ReadFileTool(self.services))
        self.register_tool(WriteFileTool(self.services))
        self.register_tool(GlobTool(self.services))
        self.register_tool(SearchFileContentTool(self.services))
        self.register_tool(ReplaceTool(self.services))
        self.register_tool(ReadManyFilesTool(self.services))

        # Shell tool
        self.register_tool(ShellTool(self.services))

        # Computer Use Automation (CUA) tools
        self.register_tool(ScreenshotTool(self.services))
        self.register_tool(MouseTool(self.services))
        self.register_tool(KeyboardTool(self.services))
        self.register_tool(ScrollTool(self.services))

        logger.info(f"Registered {len(self.tools)} built-in tools")

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

    def get_tool(self, name: str) -> Optional[Tool]:
        """
        Get a tool by name.

        Args:
            name: Name of the tool to retrieve

        Returns:
            The tool instance, or None if not found
        """
        return self.tools.get(name)

    def get_all_tools(self) -> List[Tool]:
        """
        Get all registered tools.

        Returns:
            List of all registered tools
        """
        return list(self.tools.values())

    def get_tool_names(self) -> List[str]:
        """
        Get names of all registered tools.

        Returns:
            List of tool names
        """
        return list(self.tools.keys())

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        """
        Get function declarations (schemas) for all tools.

        This is used to provide tool schemas to LLMs.

        Returns:
            List of function declaration dictionaries
        """
        declarations = []
        for tool in self.tools.values():
            try:
                schema = tool.get_schema()
                declarations.append(schema)
            except Exception as e:
                logger.error(f"Failed to get schema for tool {tool.name}: {e}")
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

        Args:
            tool_name: Name of the tool to execute
            **kwargs: Tool parameters

        Returns:
            Tool execution result
        """
        tool = self.get_tool(tool_name)
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
            from backend.tools.base import ToolContext

            context = ToolContext()
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
        return [tool for tool in self.tools.values() if tool.kind.value == kind]

    def enable_tool(self, tool_name: str) -> bool:
        """
        Enable a tool (for future use with tool enable/disable functionality).

        Args:
            tool_name: Name of the tool to enable

        Returns:
            True if tool was enabled, False if tool not found
        """
        # For now, all tools are always enabled
        # This can be extended to support enabling/disabling tools
        return tool_name in self.tools

    def disable_tool(self, tool_name: str) -> bool:
        """
        Disable a tool (for future use with tool enable/disable functionality).

        Args:
            tool_name: Name of the tool to disable

        Returns:
            True if tool was disabled, False if tool not found
        """
        # For now, tools cannot be disabled
        # This can be extended to support enabling/disabling tools
        return tool_name in self.tools

    def get_registry_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the tool registry.

        Returns:
            Dictionary with registry statistics
        """
        tools_by_kind = {}
        for tool in self.tools.values():
            kind = tool.kind.value
            tools_by_kind[kind] = tools_by_kind.get(kind, 0) + 1

        return {
            "total_tools": len(self.tools),
            "tools_by_kind": tools_by_kind,
            "tool_names": sorted(self.tools.keys()),
        }


def create_tool_registry(config: Any) -> ToolRegistry:
    """
    Create and initialize a tool registry.

    Args:
        config: Application configuration

    Returns:
        Initialized tool registry
    """
    return ToolRegistry(config)
