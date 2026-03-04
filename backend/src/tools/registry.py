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
_LEGACY_COMPUTER_TOOL_NAMES = frozenset(
    {
        "mouse_control",
        "keyboard_control",
        "screenshot",
        "scroll_control",
        "switch_tab",
        "wait",
    }
)
_UNIFIED_COMPUTER_TOOL_NAME = "computer_use"


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
        declarations = self.schema_registry.get_declarations(self.get_all_tools())
        return self._collapse_unified_computer_use_declarations(declarations)

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
        tool_name_set = self._normalize_requested_tool_names(tool_names)
        filtered_tools = [tool for tool in self.get_all_tools() if tool.name in tool_name_set]
        declarations = self.schema_registry.get_declarations(filtered_tools)
        return self._collapse_unified_computer_use_declarations(declarations)

    def is_tool_available(self, tool_name: str) -> bool:
        """Check if a tool is available."""
        return tool_name in self.tools

    @staticmethod
    def _extract_schema_parameters(schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Extract parameters from schema while preserving compatibility fallback behavior."""
        if schema is None:
            return None
        if not isinstance(schema, dict):
            return {}
        function_schema = schema.get("function", {})
        if not isinstance(function_schema, dict):
            return {}
        parameters = function_schema.get("parameters", {})
        if not isinstance(parameters, dict):
            return {}
        return parameters

    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """
        Get capabilities information for a tool.

        Args:
            tool_name: Name of the tool

        Returns:
            Tool capabilities dictionary, or None if tool not found
        """
        tool = self.get_tool(tool_name)
        if not tool:
            return None

        schema = self.schema_registry.get_schema(tool)
        parameters = self._extract_schema_parameters(schema)
        if parameters is None:
            return None

        return {
            "name": tool.name,
            "description": tool.description,
            "parameters": parameters,
            "requires_context": True,
        }
    @staticmethod
    def _collapse_unified_computer_use_declarations(
        declarations: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        has_unified = any(
            isinstance(item, dict)
            and isinstance(item.get("function"), dict)
            and item["function"].get("name") == _UNIFIED_COMPUTER_TOOL_NAME
            for item in declarations
        )
        if not has_unified:
            return declarations

        collapsed: List[Dict[str, Any]] = []
        for item in declarations:
            fn = item.get("function") if isinstance(item, dict) else None
            fn_name = fn.get("name") if isinstance(fn, dict) else None
            if isinstance(fn_name, str) and fn_name in _LEGACY_COMPUTER_TOOL_NAMES:
                continue
            collapsed.append(item)
        return collapsed

    @staticmethod
    def _normalize_requested_tool_names(tool_names: List[str]) -> set[str]:
        normalized = {
            name
            for name in tool_names
            if isinstance(name, str)
        }
        if normalized & _LEGACY_COMPUTER_TOOL_NAMES:
            normalized -= _LEGACY_COMPUTER_TOOL_NAMES
            normalized.add(_UNIFIED_COMPUTER_TOOL_NAME)
        return normalized
