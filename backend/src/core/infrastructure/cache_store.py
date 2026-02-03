"""In-memory cache implementation."""
import asyncio
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional, TypeVar, Callable, Awaitable

from backend.src.core.infrastructure.cache_entry import CacheEntry

T = TypeVar("T")


class Cache:
    """
    In-memory cache with TTL support and LRU eviction.

    Thread-safe: Uses RLock for all operations to prevent race conditions.
    Prevents deadlocks by using separate synchronization primitives for sync and async operations.

    Features:
    - TTL-based expiration
    - LRU eviction when max_size is reached
    - Negative caching for errors (configurable TTL)
    - Separate sync/async coordination to prevent deadlocks
    """

    def __init__(
        self,
        default_ttl: float = 3600.0,
        max_size: Optional[int] = None,
        error_ttl: float = 5.0,
    ):
        """
        Initialize the cache.

        Args:
            default_ttl: Default time-to-live in seconds (default: 1 hour)
            max_size: Maximum number of entries (None = unlimited, default: None)
            error_ttl: TTL for cached errors in seconds (default: 5.0)
        """
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self.default_ttl = default_ttl
        self.error_ttl = error_ttl
        self.max_size = max_size
        self._hits = 0
        self._misses = 0
        self._lock = threading.RLock()
        self._computing_sync: Dict[str, threading.Event] = {}
        self._computing_async: Dict[str, asyncio.Event] = {}

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.

        Thread-safe: Uses lock to prevent race conditions.
        Updates LRU order on access.
        """
        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._misses += 1
                return None

            if time.time() > entry.expires_at:
                del self._cache[key]
                self._misses += 1
                return None

            self._cache.move_to_end(key)

            self._hits += 1
            if entry.is_error:
                raise entry.value
            return entry.value

    def _new_async_event(self) -> asyncio.Event:
        """Create an asyncio.Event in the current loop (or a new one if missing)."""
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return asyncio.Event()

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

    def _store_error_entry(self, key: str, error: Exception) -> None:
        error_entry = CacheEntry(
            value=error,
            expires_at=time.time() + self.error_ttl,
            is_error=True,
        )
        with self._lock:
            if self.max_size is not None and len(self._cache) >= self.max_size:
                if self._cache:
                    self._cache.popitem(last=False)
            self._cache[key] = error_entry
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

    def get_or_compute(
        self,
        key: str,
        compute_func: Callable[[], T],
        ttl: Optional[float] = None,
    ) -> T:
        """
        Get value from cache or compute it if not found.
        """
        value = self.get(key)
        if value is not None:
            return value

        event = None
        should_compute = False
        with self._lock:
            if key in self._computing_sync:
                event = self._computing_sync[key]
                should_compute = False
            else:
                event = threading.Event()
                self._computing_sync[key] = event
                should_compute = True

        if not should_compute:
            event.wait()
            try:
                value = self.get(key)
                if value is not None:
                    return value
            except Exception:
                raise
            with self._lock:
                if key not in self._computing_sync:
                    event = threading.Event()
                    self._computing_sync[key] = event
                    should_compute = True
                else:
                    event = self._computing_sync[key]
                    if not event.is_set():
                        event.wait()
                        try:
                            value = self.get(key)
                            if value is not None:
                                return value
                        except Exception:
                            raise
                    if key not in self._computing_sync:
                        event = threading.Event()
                        self._computing_sync[key] = event
                        should_compute = True

        if should_compute:
            try:
                value = compute_func()
                self.set(key, value, ttl)
                return value
            except Exception as e:
                self._store_error_entry(key, e)
                raise
            finally:
                with self._lock:
                    if key in self._computing_sync and self._computing_sync[key] is event:
                        del self._computing_sync[key]
                    if event is not None:
                        event.set()

        return self.get(key) or compute_func()

    async def get_or_compute_async(
        self,
        key: str,
        compute_func: Callable[[], Awaitable[T]],
        ttl: Optional[float] = None,
    ) -> T:
        """Get value from cache or compute it asynchronously if not found."""
        try:
            value = self.get(key)
            if value is not None:
                return value
        except Exception:
            raise

        event = None
        should_compute = False
        with self._lock:
            if key in self._computing_async:
                event = self._computing_async[key]
                should_compute = False
            else:
                event = self._new_async_event()
                self._computing_async[key] = event
                should_compute = True

        if not should_compute:
            await event.wait()
            try:
                value = self.get(key)
                if value is not None:
                    return value
            except Exception:
                raise
            with self._lock:
                if key not in self._computing_async:
                    event = self._new_async_event()
                    self._computing_async[key] = event
                    should_compute = True
                else:
                    event = self._computing_async[key]
                    if not event.is_set():
                        await event.wait()
                        try:
                            value = self.get(key)
                            if value is not None:
                                return value
                        except Exception:
                            raise
                    if key not in self._computing_async:
                        event = self._new_async_event()
                        self._computing_async[key] = event
                        should_compute = True

        if should_compute:
            try:
                value = await compute_func()
                self.set(key, value, ttl)
                return value
            except Exception as e:
                self._store_error_entry(key, e)
                raise
            finally:
                with self._lock:
                    if key in self._computing_async and self._computing_async[key] is event:
                        del self._computing_async[key]
                    if event is not None:
                        event.set()

        return self.get(key) or await compute_func()
