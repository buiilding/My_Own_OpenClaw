"""
Backend tool registry.

This module manages the registration and provision of tool schemas for the LLM.
In the current architecture, most tools are executed on the frontend, and the
backend provides canonical model-facing tool specs plus remote stubs.
"""

import logging
from copy import deepcopy
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from backend.src.tools.schema_registry import SchemaRegistry
from backend.src.tools.tool_catalog import (
    get_built_tool_catalog,
    get_model_visible_tool_names,
)
from backend.src.tools.tool_specs import get_tool_spec_parameters
from backend.src.tools.web_search.tool import WebSearchTool

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
        self.tool_specs: Dict[str, Dict[str, Any]] = {}
        self.schema_registry = SchemaRegistry(cache_manager=cache_manager)

        if context_factory is None:
            from backend.src.core.services.context_factory import ContextFactory

            self.context_factory = ContextFactory(config=config, tool_registry=self)
        else:
            self.context_factory = context_factory

        self._register_remote_tools()
        self._register_backend_tools()

    def _register_remote_tools(self) -> None:
        for built_entry in get_built_tool_catalog():
            name = built_entry.entry.name
            try:
                self.register_tool(
                    built_entry.tool_class(),
                    tool_spec=built_entry.tool_spec,
                )
                logger.debug("Registered remote tool: %s", name)
            except Exception as exc:
                logger.error("Failed to register remote tool %s: %s", name, exc)

    def _register_backend_tools(self) -> None:
        for tool_class in (WebSearchTool,):
            name = tool_class.name
            try:
                self.register_tool(tool_class())
                logger.debug("Registered backend tool: %s", name)
            except Exception as exc:
                logger.error("Failed to register backend tool %s: %s", name, exc)

    def register_tool(
        self,
        tool: "SDKTool",
        *,
        tool_spec: Optional[Dict[str, Any]] = None,
    ) -> None:
        if tool.name in self.tools:
            logger.warning("Tool '%s' is already registered. Overwriting.", tool.name)
        self.tools[tool.name] = tool
        if tool_spec is None:
            tool_spec = tool.__class__.build_tool_spec()
        self.tool_specs[tool.name] = deepcopy(tool_spec)

    def get_tool(self, name: str) -> Optional["SDKTool"]:
        return self.tools.get(name)

    def get_tool_names(self) -> List[str]:
        return sorted(self.tools.keys())

    def get_model_tool_names(self) -> List[str]:
        registered = set(self.tools.keys())
        model_tool_names = [
            tool_name
            for tool_name in get_model_visible_tool_names()
            if tool_name in registered
        ]
        if "web_search" in registered and "web_search" not in model_tool_names:
            model_tool_names.append("web_search")
        return model_tool_names

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
            tool_spec = self.tool_specs.get(tool_name)
            if not isinstance(tool_spec, dict):
                continue
            schema = self.schema_registry.get_schema(tool_name, tool_spec)
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

        tool_spec = self.tool_specs.get(tool_name)
        if not isinstance(tool_spec, dict):
            return None

        schema = self.schema_registry.get_schema(tool_name, tool_spec)
        parameters = self._extract_schema_parameters(schema)
        if parameters is None:
            return None

        return {
            "name": tool.name,
            "description": tool.description,
            "parameters": parameters,
            "requires_context": True,
        }
