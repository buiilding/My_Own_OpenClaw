"""Cache manager for shared caches."""
import hashlib
from typing import Any, Dict

from backend.src.core.infrastructure.cache_store import Cache


class CacheManager:
    """
    Centralized cache manager for different cache types.

    Provides separate caches for:
    - Tool schemas
    - Embeddings
    - LLM clients
    - Generic cache
    """

    def __init__(self) -> None:
        self.tool_schemas = Cache(default_ttl=3600.0)
        self.embeddings = Cache(default_ttl=86400.0)
        self.llm_clients = Cache(default_ttl=86400.0)
        self.generic = Cache(default_ttl=3600.0)

    def get_tool_schema_key(self, tool_name: str) -> str:
        """Generate cache key for tool schema."""
        return f"tool_schema:{tool_name}"

    def get_embedding_key(self, text: str) -> str:
        """Generate cache key for embedding."""
        hashed = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return f"embedding:{hashed}"

    def get_llm_client_key(self, config_hash: str) -> str:
        """Generate cache key for LLM client."""
        return f"llm_client:{config_hash}"

    def clear_all(self) -> None:
        """Clear all caches."""
        self.tool_schemas.clear()
        self.embeddings.clear()
        self.llm_clients.clear()
        self.generic.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics for all caches."""
        return {
            "tool_schemas": self.tool_schemas.get_stats(),
            "embeddings": self.embeddings.get_stats(),
            "llm_clients": self.llm_clients.get_stats(),
            "generic": self.generic.get_stats(),
        }


cache_manager = CacheManager()
