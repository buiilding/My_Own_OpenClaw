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
    from backend.src.core.services.context_factory import ContextFactory
    from backend.src.sdk.tool import Tool as SDKTool

from backend.src.tools.computer.unified_schema import (
    get_unified_computer_use_function_declaration,
)
from backend.src.tools.remote import get_all_remote_tools
from backend.src.tools.schema_registry import SchemaRegistry
from backend.src.tools.system.unified_schema import (
    get_unified_system_use_function_declaration,
)
from backend.src.tools.tool_catalog import (
    get_model_visible_tool_names,
    get_schema_source_tool_names,
    get_wrapper_member_names,
    is_wrapper_tool,
    normalize_model_tool_name,
    resolve_model_tool_surface,
)

logger = logging.getLogger(__name__)
_UNIFIED_COMPUTER_TOOL_NAME = "computer_use"
_UNIFIED_SYSTEM_TOOL_NAME = "system_use"
_LEGACY_COMPUTER_TOOL_NAMES = frozenset(get_wrapper_member_names("computer_use"))
_LEGACY_SYSTEM_TOOL_NAMES = frozenset(get_wrapper_member_names("system_use"))


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
        self.config = config
        self.tools: Dict[str, "SDKTool"] = {}
        self.schema_registry = SchemaRegistry(cache_manager=cache_manager)

        if context_factory is None:
            from backend.src.core.services.context_factory import ContextFactory

            self.context_factory = ContextFactory(config=config, tool_registry=self)
        else:
            self.context_factory = context_factory

        self._register_remote_tools()

    def _register_remote_tools(self) -> None:
        remote_tools = get_all_remote_tools()
        for name, tool_class in remote_tools.items():
            try:
                self.register_tool(tool_class())
                logger.debug("Registered remote tool: %s", name)
            except Exception as exc:
                logger.error("Failed to register remote tool %s: %s", name, exc)

    def register_tool(self, tool: "SDKTool") -> None:
        if tool.name in self.tools:
            logger.warning("Tool '%s' is already registered. Overwriting.", tool.name)
        self.tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional["SDKTool"]:
        return self.tools.get(name)

    def get_all_tools(self) -> List["SDKTool"]:
        return list(self.tools.values())

    def get_tool_names(self) -> List[str]:
        return sorted(list(self.tools.keys()))

    def get_schema_source_tool_names(self) -> List[str]:
        """Return concrete/direct tools that feed model-facing schema generation."""
        registered = set(self.tools.keys())
        catalog_tool_names = [
            tool_name
            for tool_name in get_schema_source_tool_names()
            if tool_name in registered
        ]
        extra_tool_names = sorted(
            tool_name
            for tool_name in registered
            if tool_name not in set(get_model_visible_tool_names())
            and tool_name not in set(get_schema_source_tool_names())
        )
        return catalog_tool_names + extra_tool_names

    def get_model_tool_names(self) -> List[str]:
        """Return model-visible tool names available in this registry."""
        resolved = resolve_model_tool_surface(
            self.get_schema_source_tool_names(),
            available_names=self.get_schema_source_tool_names(),
        )
        visible = set(get_model_visible_tool_names())
        return [
            tool_name
            for tool_name in resolved.ordered_names
            if tool_name in visible
        ]

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        return self.get_function_declarations_filtered(self.get_schema_source_tool_names())

    def get_function_declarations_filtered(
        self,
        tool_names: List[str],
    ) -> List[Dict[str, Any]]:
        available_schema_sources = self.get_schema_source_tool_names()
        surface = resolve_model_tool_surface(
            tool_names,
            available_names=available_schema_sources,
        )
        concrete_schemas = self._get_concrete_schema_map(
            available_schema_sources=available_schema_sources,
            wrapper_members=surface.wrapper_members,
            ordered_model_tool_names=surface.ordered_names,
            requested_tool_names=tool_names,
        )

        declarations: List[Dict[str, Any]] = []
        for tool_name in surface.ordered_names:
            if tool_name == "computer_use":
                declarations.append(
                    get_unified_computer_use_function_declaration(
                        included_tool_names=surface.wrapper_members.get(tool_name, ()),
                        concrete_declarations=concrete_schemas,
                    )
                )
                continue
            if tool_name == "system_use":
                declarations.append(
                    get_unified_system_use_function_declaration(
                        included_tool_names=surface.wrapper_members.get(tool_name, ()),
                        concrete_declarations=concrete_schemas,
                    )
                )
                continue

            declaration = concrete_schemas.get(tool_name)
            if isinstance(declaration, dict):
                declarations.append(declaration)

        surfaced_tool_names = set(surface.ordered_names)
        for tool_name in tool_names:
            if not isinstance(tool_name, str):
                continue
            if tool_name in surfaced_tool_names or is_wrapper_tool(tool_name):
                continue
            if normalize_model_tool_name(tool_name) in surfaced_tool_names:
                continue
            declaration = concrete_schemas.get(tool_name)
            if isinstance(declaration, dict):
                declarations.append(declaration)

        return declarations

    def is_tool_available(self, tool_name: str) -> bool:
        return tool_name in self.tools

    @staticmethod
    def _extract_schema_parameters(schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
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
        tool = self.get_tool(tool_name)
        if tool is None:
            return None

        if tool_name in self.get_model_tool_names():
            declarations = self.get_function_declarations_filtered([tool_name])
            schema = declarations[0] if declarations else None
        elif is_wrapper_tool(tool_name):
            schema = None
        else:
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

    def _get_concrete_schema_map(
        self,
        *,
        available_schema_sources: List[str],
        wrapper_members: Dict[str, tuple[str, ...]],
        ordered_model_tool_names: tuple[str, ...],
        requested_tool_names: List[str],
    ) -> Dict[str, Dict[str, Any]]:
        requested_concrete_names = {
            member_name
            for members in wrapper_members.values()
            for member_name in members
        }
        requested_concrete_names.update(
            tool_name
            for tool_name in ordered_model_tool_names
            if tool_name not in wrapper_members
        )
        requested_concrete_names.update(
            tool_name
            for tool_name in requested_tool_names
            if isinstance(tool_name, str)
            and normalize_model_tool_name(tool_name) == tool_name
        )

        concrete_schemas: Dict[str, Dict[str, Any]] = {}
        for tool_name in available_schema_sources:
            if tool_name not in requested_concrete_names:
                continue
            tool = self.get_tool(tool_name)
            if tool is None:
                continue
            schema = self.schema_registry.get_schema(tool)
            if isinstance(schema, dict):
                concrete_schemas[tool_name] = schema
        return concrete_schemas
