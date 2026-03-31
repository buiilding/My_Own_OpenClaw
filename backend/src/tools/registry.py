"""
Tool Registry for the Desktop Assistant.

This module manages the registration and provision of tool schemas for the LLM.
In the current architecture, most tools are executed on the frontend, and the
backend provides canonical model-facing tool specs plus remote stubs.
"""

import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from backend.src.tools.remote import get_all_remote_tools
from backend.src.tools.schema_registry import SchemaRegistry
from backend.src.tools.tool_catalog import (
    get_model_visible_tool_names,
)
from backend.src.tools.tool_specs import get_tool_spec_parameters

if TYPE_CHECKING:
    from backend.src.core.infrastructure.cache import CacheManager
    from backend.src.core.services.context_factory import ContextFactory
    from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class ToolRegistry:
    """Registry for remote tool stubs and their canonical model-facing specs."""

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
        for name, tool_class in get_all_remote_tools().items():
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
        return sorted(self.tools.keys())

    def get_model_tool_names(self) -> List[str]:
        registered = set(self.tools.keys())
        return [
            tool_name
            for tool_name in get_model_visible_tool_names()
            if tool_name in registered
        ]

    def get_function_declarations(self) -> List[Dict[str, Any]]:
        return self.get_function_declarations_filtered(self.get_model_tool_names())

    def get_function_declarations_filtered(
        self,
        tool_names: List[str],
    ) -> List[Dict[str, Any]]:
        declarations: List[Dict[str, Any]] = []
        seen_tool_names: set[str] = set()
        for tool_name in tool_names:
            if not isinstance(tool_name, str) or tool_name in seen_tool_names:
                continue
            seen_tool_names.add(tool_name)
            tool = self.get_tool(tool_name)
            if tool is None:
                continue
            schema = self.schema_registry.get_schema(tool)
            if isinstance(schema, dict):
                declarations.append(schema)
        return declarations

    def is_tool_available(self, tool_name: str) -> bool:
        return tool_name in self.tools

    @staticmethod
    def _extract_schema_parameters(schema: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if schema is None:
            return None
        return get_tool_spec_parameters(schema) or {}

    def get_tool_capabilities(self, tool_name: str) -> Optional[Dict[str, Any]]:
        tool = self.get_tool(tool_name)
        if tool is None:
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
