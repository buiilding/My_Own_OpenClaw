"""In-memory cache implementation."""
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional

from backend.src.core.infrastructure.cache_entry import CacheEntry


class Cache:
    """
    In-memory cache with TTL support and LRU eviction.

    Thread-safe: Uses RLock for all operations to prevent race conditions.
    Features:
    - TTL-based expiration
    - LRU eviction when max_size is reached
    """

    def __init__(
        self,
        default_ttl: float = 3600.0,
        max_size: Optional[int] = None,
    ):
        """
        Initialize the cache.

        Args:
            default_ttl: Default time-to-live in seconds (default: 1 hour)
            max_size: Maximum number of entries (None = unlimited, default: None)
        """
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self.default_ttl = default_ttl
        self.max_size = max_size
        self._hits = 0
        self._misses = 0
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.

        Thread-safe: Uses lock to prevent race conditions.
        Updates LRU order on access.
        """
        found, value = self._get_cached_value(key)
        return value if found else None

    def _get_cached_value(self, key: str) -> tuple[bool, Any]:
        """Return cache presence separately from the stored value."""
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._misses += 1
                return False, None

            if time.time() > entry.expires_at:
                del self._cache[key]
                self._misses += 1
                return False, None

            self._cache.move_to_end(key)

            self._hits += 1
            return True, entry.value

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Set a value in the cache."""
        ttl = ttl if ttl is not None else self.default_ttl
        expires_at = time.time() + ttl

        with self._lock:
            key_exists = key in self._cache

            if key_exists:
                del self._cache[key]

            if (
                not key_exists
                and self.max_size is not None
                and len(self._cache) >= self.max_size
            ):
                if self._cache:
                    self._cache.popitem(last=False)

            self._cache[key] = CacheEntry(value=value, expires_at=expires_at)
            self._cache.move_to_end(key)

    def delete(self, key: str) -> bool:
        """Delete a value from the cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    def cleanup_expired(self) -> int:
        """Remove expired entries from the cache."""
        now = time.time()
        with self._lock:
            expired_keys = [
                key
                for key, entry in self._cache.items()
                if now > entry.expires_at
            ]
            for key in expired_keys:
                del self._cache[key]
            return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._hits + self._misses
            hit_rate = (self._hits / total_requests) if total_requests > 0 else 0
            return {
                "size": len(self._cache),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": hit_rate,
                "total_requests": total_requests,
            }
