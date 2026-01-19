"""
Caching Layer for the Desktop Assistant.

Provides in-memory caching with TTL support for:
- Tool schemas
- Embeddings
- LLM client instances
- Other frequently accessed data
"""
import asyncio
import hashlib
import logging
import threading
import time
from collections import OrderedDict
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
    is_error: bool = False  # True if value is an exception (negative caching)


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
        error_ttl: float = 5.0
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
        self._lock = threading.RLock()  # Reentrant lock for thread safety
        # Separate sync and async coordination to prevent deadlocks
        self._computing_sync: Dict[str, threading.Event] = {}  # For sync operations
        self._computing_async: Dict[str, asyncio.Event] = {}  # For async operations
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.
        
        Thread-safe: Uses lock to prevent race conditions.
        Updates LRU order on access.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value if found and not expired, None otherwise
            If entry is an error (negative caching), raises the cached exception
            
        Raises:
            Exception: If the cached entry is an error (negative caching)
        """
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._misses += 1
                return None
            
            # Check expiration
            if time.time() > entry.expires_at:
                del self._cache[key]
                self._misses += 1
                return None
            
            # Update LRU order (move to end)
            self._cache.move_to_end(key)
            
            self._hits += 1
            # THUNDERING HERD FIX: If this is a cached error, raise it
            # This propagates the exception to all waiters instead of allowing retries
            if entry.is_error:
                raise entry.value
            return entry.value
    
    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """
        Set a value in the cache.
        
        Thread-safe: Uses lock to prevent race conditions.
        Evicts LRU entries if max_size is exceeded.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Time-to-live in seconds (uses default if None)
        """
        ttl = ttl if ttl is not None else self.default_ttl
        expires_at = time.time() + ttl
        
        with self._lock:
            # Check if key already exists (affects whether we need to evict)
            key_exists = key in self._cache
            
            # Remove existing entry if present (to update LRU order)
            if key_exists:
                del self._cache[key]
            
            # Evict LRU entries if max_size would be exceeded
            # Only need to evict if adding a new key (not replacing existing)
            if not key_exists and self.max_size is not None and len(self._cache) >= self.max_size:
                # Remove oldest entry (first in OrderedDict)
                if self._cache:
                    self._cache.popitem(last=False)
            
            self._cache[key] = CacheEntry(
                value=value,
                expires_at=expires_at
            )
            # Move to end (most recently used)
            self._cache.move_to_end(key)
    
    def delete(self, key: str) -> bool:
        """
        Delete a value from the cache.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        Args:
            key: Cache key
            
        Returns:
            True if key was deleted, False if not found
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False
    
    def clear(self) -> None:
        """Clear all cache entries.
        
        Thread-safe: Uses lock to prevent race conditions.
        """
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0
    
    def cleanup_expired(self) -> int:
        """
        Remove expired entries from the cache.
        
        Thread-safe: Uses lock to prevent race conditions.
        
        Returns:
            Number of entries removed
        """
        now = time.time()
        with self._lock:
            expired_keys = [
                key for key, entry in self._cache.items()
                if now > entry.expires_at
            ]
            
            for key in expired_keys:
                del self._cache[key]
        
        return len(expired_keys)
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.
        
        Thread-safe: Uses lock to prevent race conditions.
        """
        with self._lock:
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
        
        Thread-safe: Prevents duplicate computations when multiple threads
        request the same key simultaneously.
        
        Args:
            key: Cache key
            compute_func: Function to compute value if not cached
            ttl: Time-to-live in seconds (uses default if None)
            
        Returns:
            Cached or computed value
        """
        # Try to get from cache first
        value = self.get(key)
        if value is not None:
            return value
        
        # Check if another thread is already computing this value
        event = None
        should_compute = False
        with self._lock:
            if key in self._computing_sync:
                # Another thread is computing, wait for it
                event = self._computing_sync[key]
                should_compute = False
            else:
                # Mark that we're computing this value
                event = threading.Event()
                self._computing_sync[key] = event
                should_compute = True
        
        if not should_compute:
            # Wait for the other thread to finish
            event.wait()
            # Try to get the value again after waiting
            # THUNDERING HERD FIX: get() will raise if it's a cached error
            # This propagates the exception to all waiters, preventing retry storms
            try:
                value = self.get(key)
                if value is not None:
                    return value
            except Exception as e:
                # Cached error - propagate to caller instead of retrying
                # This prevents thundering herd on persistent failures
                raise
            # If still not found (expired), compute ourselves
            with self._lock:
                if key not in self._computing_sync:
                    event = threading.Event()
                    self._computing_sync[key] = event
                    should_compute = True
                else:
                    # Another thread started, wait again
                    event = self._computing_sync[key]
                    if not event.is_set():
                        event.wait()
                        try:
                            value = self.get(key)
                            if value is not None:
                                return value
                        except Exception as e:
                            # Cached error - propagate instead of retrying
                            raise
                    # If still not found, we compute
                    if key not in self._computing_sync:
                        event = threading.Event()
                        self._computing_sync[key] = event
                        should_compute = True
        
        if should_compute:
            # Compute the value (outside lock to allow other operations)
            computation_error = None
            try:
                value = compute_func()
                self.set(key, value, ttl)
                return value
            except Exception as e:
                # THUNDERING HERD FIX: Store exception for propagation to waiters
                # This prevents all waiters from immediately retrying when computation fails
                # Negative caching: Cache the exception for a short TTL
                # This prevents thundering herd on persistent failures (e.g., backend service down)
                # Waiters will receive the exception instead of retrying immediately
                error_entry = CacheEntry(
                    value=e,  # Store exception as value (callers must check type)
                    expires_at=time.time() + self.error_ttl,
                    is_error=True  # Mark as error entry
                )
                with self._lock:
                    # Evict LRU entries if max_size exceeded
                    if self.max_size is not None and len(self._cache) >= self.max_size:
                        if self._cache:
                            self._cache.popitem(last=False)
                    self._cache[key] = error_entry
                    self._cache.move_to_end(key)
                # Re-raise to propagate to caller
                raise
            finally:
                # Always cleanup, even if computation fails
                with self._lock:
                    if key in self._computing_sync and self._computing_sync[key] is event:
                        del self._computing_sync[key]
                    if event is not None:
                        event.set()
        else:
            # Fallback: should not reach here, but handle gracefully
            return self.get(key) or compute_func()
    
    async def get_or_compute_async(
        self,
        key: str,
        compute_func: Callable[[], Awaitable[T]],
        ttl: Optional[float] = None
    ) -> T:
        """
        Get value from cache or compute it asynchronously if not found.
        
        Thread-safe: Prevents duplicate computations when multiple coroutines
        request the same key simultaneously. Uses asyncio.Event to prevent deadlocks
        when called from the event loop thread.
        
        Args:
            key: Cache key
            compute_func: Async function to compute value if not cached
            ttl: Time-to-live in seconds (uses default if None)
            
        Returns:
            Cached or computed value
        """
        # Try to get from cache first
        try:
            value = self.get(key)
            if value is not None:
                return value
        except Exception as e:
            # Cached error - propagate to caller
            raise
        
        # Check if another coroutine is already computing this value
        event = None
        should_compute = False
        with self._lock:
            if key in self._computing_async:
                # Wait for the other coroutine to finish computing
                event = self._computing_async[key]
                should_compute = False
            else:
                # Mark that we're computing this value
                # Create asyncio.Event in the event loop context
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    # No event loop running, create new one (shouldn't happen in normal usage)
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                event = asyncio.Event()
                self._computing_async[key] = event
                should_compute = True
        
        if not should_compute:
            # Wait for the other coroutine to finish (non-blocking for event loop)
            await event.wait()
            # Try to get the value again after waiting
            try:
                value = self.get(key)
                if value is not None:
                    return value
            except Exception as e:
                # Cached error - propagate to caller instead of retrying
                raise
            # If still not found (expired), compute ourselves
            with self._lock:
                if key not in self._computing_async:
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                    event = asyncio.Event()
                    self._computing_async[key] = event
                    should_compute = True
                else:
                    # Another coroutine started, wait again
                    event = self._computing_async[key]
                    if not event.is_set():
                        await event.wait()
                        try:
                            value = self.get(key)
                            if value is not None:
                                return value
                        except Exception as e:
                            # Cached error - propagate instead of retrying
                            raise
                    # If still not found, we compute
                    if key not in self._computing_async:
                        try:
                            loop = asyncio.get_running_loop()
                        except RuntimeError:
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                        event = asyncio.Event()
                        self._computing_async[key] = event
                        should_compute = True
        
        if should_compute:
            # Compute the value (outside lock to allow other operations)
            try:
                value = await compute_func()
                self.set(key, value, ttl)
                return value
            except Exception as e:
                # THUNDERING HERD FIX: Store exception for propagation to waiters
                # Negative caching: Cache the exception for a short TTL
                error_entry = CacheEntry(
                    value=e,
                    expires_at=time.time() + self.error_ttl,
                    is_error=True
                )
                with self._lock:
                    # Evict LRU entries if max_size exceeded
                    if self.max_size is not None and len(self._cache) >= self.max_size:
                        if self._cache:
                            self._cache.popitem(last=False)
                    self._cache[key] = error_entry
                    self._cache.move_to_end(key)
                # Re-raise to propagate to caller
                raise
            finally:
                # Always cleanup, even if computation fails
                with self._lock:
                    if key in self._computing_async and self._computing_async[key] is event:
                        del self._computing_async[key]
                    if event is not None:
                        event.set()
        else:
            # Fallback: should not reach here, but handle gracefully
            try:
                value = self.get(key)
                if value is not None:
                    return value
            except Exception as e:
                raise
            return await compute_func()


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

