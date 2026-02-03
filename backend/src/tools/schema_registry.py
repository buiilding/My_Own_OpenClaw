"""
Schema Registry.

This module handles the generation and caching of tool schemas (function declarations).
"""
import logging
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from backend.src.sdk.tool import Tool as SDKTool
from backend.src.core.infrastructure.cache import cache_manager

logger = logging.getLogger(__name__)


class SchemaRegistry:
    """Manages tool schemas."""

    def get_schema(self, tool: "SDKTool") -> Optional[Dict[str, Any]]:
        """
        Get schema for a tool, using cache if available.
        """
        try:
            # Try cache first
            cache_key = cache_manager.get_tool_schema_key(tool.name)
            schema = cache_manager.tool_schemas.get(cache_key)
            
            if schema is None:
                # Cache miss - generate schema
                schema = tool.get_json_schema()
                cache_manager.tool_schemas.set(cache_key, schema)
            
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
