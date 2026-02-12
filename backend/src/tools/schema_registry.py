"""
Schema Registry.

This module handles the generation and caching of tool schemas (function declarations).
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.core.infrastructure.cache import CacheManager
    from backend.src.sdk.tool import Tool as SDKTool

logger = logging.getLogger(__name__)


class SchemaRegistry:
    """Manages tool schemas."""

    def __init__(self, cache_manager: "CacheManager"):
        self._cache_manager = cache_manager

    def get_schema(self, tool: "SDKTool") -> Optional[Dict[str, Any]]:
        """
        Get schema for a tool, using cache if available.
        """
        try:
            # Try cache first
            cache_key = self._cache_manager.get_tool_schema_key(tool.name)
            schema = self._cache_manager.tool_schemas.get(cache_key)

            if schema is not None and not self._is_canonical_tool_schema(schema):
                logger.warning(
                    "Cached schema for tool %s is not canonical tool object; regenerating.",
                    tool.name,
                )
                schema = None

            if schema is None:
                # Cache miss - generate schema
                schema = tool.get_json_schema()
                if not self._is_canonical_tool_schema(schema):
                    raise ValueError(
                        f"Tool {tool.name} emitted non-canonical schema. "
                        "Expected {type:'function', function:{name, parameters}}."
                    )
                self._cache_manager.tool_schemas.set(cache_key, schema)
            
            return schema
        except Exception as e:
            logger.error(f"Failed to get schema for tool {tool.name}: {e}")
            return None

    def get_declarations(self, tools: List["SDKTool"]) -> List[Dict[str, Any]]:
        """
        Get function declarations for a list of tools.
        """
        declarations = []
        for tool in tools:
            schema = self.get_schema(tool)
            if schema:
                declarations.append(schema)
        return declarations

    @staticmethod
    def _is_canonical_tool_schema(schema: Any) -> bool:
        """Validate canonical OpenAI/LiteLLM tool object shape."""
        if not isinstance(schema, dict):
            return False
        if schema.get("type") != "function":
            return False
        function_schema = schema.get("function")
        if not isinstance(function_schema, dict):
            return False
        if not isinstance(function_schema.get("name"), str):
            return False
        if not isinstance(function_schema.get("parameters"), dict):
            return False
        description = function_schema.get("description")
        if description is not None and not isinstance(description, str):
            return False
        return True
