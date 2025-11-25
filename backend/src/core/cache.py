"""
Caching Layer for the Desktop Assistant.

Provides in-memory caching with TTL support for:
- Tool schemas
- Embeddings
- LLM client instances
- Other frequently accessed data
"""
import hashlib
import logging
import time
from typing import Any, Dict, Optional, TypeVar, Callable, Awaitable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class CacheEntry:
    """A cache entry with value and expiration time."""
    value: Any
    expires_at: float
    created_at: float = field(default_factory=time.time)


class Cache:
    """
    Simple in-memory cache with TTL support.
    
    Thread-safe for concurrent access (uses dict operations which are atomic in CPython).
    For production, consider using Redis or similar distributed cache.
    """
    
    def __init__(self, default_ttl: float = 3600.0):
        """
        Initialize the cache.
        
        Args:
            default_ttl: Default time-to-live in seconds (default: 1 hour)
        """
        self._cache: Dict[str, CacheEntry] = {}
        self.default_ttl = default_ttl
        self._hits = 0
        self._misses = 0
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value if found and not expired, None otherwise
        """
        entry = self._cache.get(key)
        
        if entry is None:
            self._misses += 1
            return None
        
        # Check expiration
        if time.time() > entry.expires_at:
            del self._cache[key]
            self._misses += 1
            return None
        
        self._hits += 1
        return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """
        Set a value in the cache.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if None)
        """
        ttl = ttl if ttl is not None else self.default_ttl
        expires_at = time.time() + ttl
        
        self._cache[key] = CacheEntry(
            value=value,
            expires_at=expires_at
        )
    
    def delete(self, key: str) -> bool:
        """
        Delete a value from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if key was deleted, False if not found
        """
        if key in self._cache:
            del self._cache[key]
            return True
        return False
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()
        self._hits = 0
        self._misses = 0
    
    def cleanup_expired(self) -> int:
        """
        Remove expired entries from the cache.
        
        Returns:
            Number of entries removed
        """
        now = time.time()
        expired_keys = [
            key for key, entry in self._cache.items()
            if now > entry.expires_at
        ]
        
        for key in expired_keys:
            del self._cache[key]
        
        return len(expired_keys)
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_requests = self._hits + self._misses
        hit_rate = self._hits / total_requests if total_requests > 0 else 0.0
        
        return {
            "size": len(self._cache),
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": hit_rate,
            "total_requests": total_requests
        }
    
    def get_or_compute(
        self,
        key: str,
        compute_func: Callable[[], T],
        ttl: Optional[float] = None
    ) -> T:
        """
        Get value from cache or compute it if not found.
        
        Args:
            key: Cache key
            compute_func: Function to compute value if not cached
            ttl: Time-to-live in seconds (uses default if None)
            
        Returns:
            Cached or computed value
        """
        value = self.get(key)
        if value is not None:
            return value
        
        value = compute_func()
        self.set(key, value, ttl)
        return value
    
    async def get_or_compute_async(
        self,
        key: str,
        compute_func: Callable[[], Awaitable[T]],
        ttl: Optional[float] = None
    ) -> T:
        """
        Get value from cache or compute it asynchronously if not found.
        
        Args:
            key: Cache key
            compute_func: Async function to compute value if not cached
            ttl: Time-to-live in seconds (uses default if None)
            
        Returns:
            Cached or computed value
        """
        value = self.get(key)
        if value is not None:
            return value
        
        value = await compute_func()
        self.set(key, value, ttl)
        return value


class CacheManager:
    """
    Centralized cache manager for different cache types.
    
    Provides separate caches for:
    - Tool schemas (TTL: 1 hour)
    - Embeddings (TTL: 24 hours)
    - LLM clients (TTL: until config changes)
    """
    
    def __init__(self):
        """Initialize the cache manager."""
        # Tool schema cache - schemas don't change often
        self.tool_schemas = Cache(default_ttl=3600.0)  # 1 hour
        
        # Embedding cache - embeddings are expensive to compute
        self.embeddings = Cache(default_ttl=86400.0)  # 24 hours
        
        # LLM client cache - cache per config hash
        self.llm_clients = Cache(default_ttl=86400.0)  # 24 hours (or until config changes)
        
        # Generic cache for other data
        self.generic = Cache(default_ttl=3600.0)  # 1 hour
    
    def get_tool_schema_key(self, tool_name: str) -> str:
        """Generate cache key for tool schema."""
        return f"tool_schema:{tool_name}"
    
    def get_embedding_key(self, text: str) -> str:
        """Generate cache key for embedding."""
        # Use hash to avoid storing large text in key
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        return f"embedding:{text_hash}"
    
    def get_llm_client_key(self, config_hash: str) -> str:
        """Generate cache key for LLM client."""
        return f"llm_client:{config_hash}"
    
    def clear_all(self) -> None:
        """Clear all caches."""
        self.tool_schemas.clear()
        self.embeddings.clear()
        self.llm_clients.clear()
        self.generic.clear()
    
    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all caches."""
        return {
            "tool_schemas": self.tool_schemas.get_stats(),
            "embeddings": self.embeddings.get_stats(),
            "llm_clients": self.llm_clients.get_stats(),
            "generic": self.generic.get_stats()
        }


# Global cache manager instance
cache_manager = CacheManager()

