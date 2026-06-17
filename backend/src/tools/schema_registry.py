"""
Schema Registry.

This module handles the generation and caching of tool schemas (function declarations).
"""
import copy
import logging
from typing import Any, Dict, Optional, TYPE_CHECKING
from backend.src.tools.tool_specs import is_function_tool_spec

if TYPE_CHECKING:
    from backend.src.core.infrastructure.cache_manager import CacheManager

logger = logging.getLogger(__name__)


class SchemaRegistry:
    """Manages tool schemas."""

    def __init__(self, cache_manager: "CacheManager"):
        self._cache_manager = cache_manager

    def _get_cached_schema(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """Return cached canonical schema for a tool name, or None when missing/invalid."""
        cache_key = self._cache_manager.get_tool_schema_key(tool_name)
        schema = self._cache_manager.tool_schemas.get(cache_key)
        if schema is None:
            return None
        if self._is_canonical_tool_schema(schema):
            return copy.deepcopy(schema)
        logger.warning(
            "Cached schema for tool %s is not canonical tool object; regenerating.",
            tool_name,
        )
        return None

    def _cache_schema(self, tool_name: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and cache a canonical schema payload for a tool name."""
        if not self._is_canonical_tool_schema(schema):
            raise ValueError(
                f"Tool {tool_name} emitted non-canonical schema. "
                "Expected flat {type, name, parameters} function tool spec."
            )
        cache_key = self._cache_manager.get_tool_schema_key(tool_name)
        canonical_schema = copy.deepcopy(schema)
        self._cache_manager.tool_schemas.set(cache_key, canonical_schema)
        return copy.deepcopy(canonical_schema)

    def get_schema(self, tool_name: str, schema: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get schema for a tool name, using cache if available.
        """
        try:
            cached_schema = self._get_cached_schema(tool_name)
            if cached_schema is not None:
                return cached_schema

            return self._cache_schema(tool_name, schema)
        except Exception as e:
            logger.error(f"Failed to get schema for tool {tool_name}: {e}")
            return None

    @staticmethod
    def _is_canonical_tool_schema(schema: Any) -> bool:
        """Validate canonical internal flat tool-spec shape."""
        return is_function_tool_spec(schema)
