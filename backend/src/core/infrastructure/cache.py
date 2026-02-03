"""
Caching Layer for the Desktop Assistant.

Provides in-memory caching with TTL support for:
- Tool schemas
- Embeddings
- LLM client instances
- Other frequently accessed data
"""
from backend.src.core.infrastructure.cache_entry import CacheEntry
from backend.src.core.infrastructure.cache_store import Cache
from backend.src.core.infrastructure.cache_manager import CacheManager, cache_manager

__all__ = ["Cache", "CacheEntry", "CacheManager", "cache_manager"]
