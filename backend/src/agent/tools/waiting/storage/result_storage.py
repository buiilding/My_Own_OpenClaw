"""
Centralized Tool Result Storage.

This module provides a unified interface for managing tool results, futures, and bundled results.
It replaces the scattered dict-based storage with a single, well-encapsulated class that handles
cleanup automatically.
"""

import asyncio
import logging
import time
from typing import Any, Dict, Optional
from weakref import WeakValueDictionary

from backend.src.core.interfaces.tool import ToolResult

logger = logging.getLogger(__name__)


class ToolResultStorage:
    """
    Centralized storage for tool execution results.
    
    Manages:
    - Pending tool results (waiting for frontend execution)
    - Tool result futures (for async waiting)
    - Bundled results (combined results from tool bundles)
    
    Provides automatic cleanup and memory leak prevention.
    """
    
    def __init__(self, cleanup_ttl_seconds: int = 300):
        """
        Initialize tool result storage.
        
        Args:
            cleanup_ttl_seconds: Time-to-live for results before automatic cleanup (default: 5 minutes)
        """
        # Pending tool results: request_id -> ToolResult
        self._pending_results: Dict[str, ToolResult] = {}
        
        # Tool result futures: request_id -> asyncio.Future
        # Use WeakValueDictionary to allow automatic cleanup when futures are garbage collected
        self._result_futures: WeakValueDictionary[str, asyncio.Future] = WeakValueDictionary()
        # Also maintain a regular dict for futures that need explicit tracking
        self._futures_dict: Dict[str, asyncio.Future] = {}
        
        # Bundled results: bundle_request_id -> ToolResult
        self._bundled_results: Dict[str, ToolResult] = {}
        
        # Bundle futures: bundle_id -> asyncio.Future (for atomic bundle waiting)
        self._bundle_futures: WeakValueDictionary[str, asyncio.Future] = WeakValueDictionary()
        self._bundle_futures_dict: Dict[str, asyncio.Future] = {}
        
        # Timestamps for TTL-based cleanup
        self._result_timestamps: Dict[str, float] = {}
        self._bundle_timestamps: Dict[str, float] = {}
        
        self._cleanup_ttl = cleanup_ttl_seconds
    
    def store_pending_result(self, request_id: str, result: ToolResult) -> None:
        """
        Store a pending tool result.
        
        Args:
            request_id: Request ID for the tool result
            result: Tool result to store
        """
        self._pending_results[request_id] = result
        self._result_timestamps[request_id] = time.time()
        logger.debug(f"Stored pending tool result for request_id {request_id[:15]}")
    
    def get_pending_result(self, request_id: str) -> Optional[ToolResult]:
        """
        Get a pending tool result.
        
        Args:
            request_id: Request ID to look up
            
        Returns:
            ToolResult if found, None otherwise
        """
        return self._pending_results.get(request_id)
    
    def remove_pending_result(self, request_id: str) -> bool:
        """
        Remove a pending tool result.
        
        Args:
            request_id: Request ID to remove
            
        Returns:
            True if result was found and removed, False otherwise
        """
        result = self._pending_results.pop(request_id, None)
        if result is not None:
            self._result_timestamps.pop(request_id, None)
            logger.debug(f"Removed pending tool result for request_id {request_id[:15]}")
            return True
        return False
    
    def create_result_future(self, request_id: str) -> asyncio.Future:
        """
        Create a future for waiting on a tool result.
        
        Args:
            request_id: Request ID for the future
            
        Returns:
            asyncio.Future that will be resolved when the result arrives
        """
        future = asyncio.Future()
        self._result_futures[request_id] = future
        self._futures_dict[request_id] = future
        logger.debug(f"Created result future for request_id {request_id[:15]}")
        return future
    
    def resolve_result_future(self, request_id: str, result: ToolResult) -> bool:
        """
        Resolve a waiting future with a tool result.
        
        Args:
            request_id: Request ID of the future to resolve
            result: Tool result to set as the future's result
            
        Returns:
            True if future was found and resolved, False otherwise
        """
        future = self._futures_dict.get(request_id)
        if future and not future.done():
            future.set_result(result)
            # Clean up from tracking dict (future may still be in weak dict)
            self._futures_dict.pop(request_id, None)
            logger.debug(f"Resolved result future for request_id {request_id[:15]}")
            return True
        return False
    
    def get_result_future(self, request_id: str) -> Optional[asyncio.Future]:
        """
        Get a result future if it exists.
        
        Args:
            request_id: Request ID to look up
            
        Returns:
            asyncio.Future if found, None otherwise
        """
        return self._futures_dict.get(request_id)
    
    def remove_result_future(self, request_id: str) -> bool:
        """
        Remove a result future.
        
        Args:
            request_id: Request ID to remove
            
        Returns:
            True if future was found and removed, False otherwise
        """
        future = self._futures_dict.pop(request_id, None)
        if future is not None:
            # Weak dict will clean up automatically
            logger.debug(f"Removed result future for request_id {request_id[:15]}")
            return True
        return False
    
    def store_bundled_result(self, bundle_request_id: str, result: ToolResult) -> None:
        """
        Store a bundled tool result.
        
        Args:
            bundle_request_id: Bundle request ID
            result: Combined bundled result
        """
        self._bundled_results[bundle_request_id] = result
        self._bundle_timestamps[bundle_request_id] = time.time()
        logger.debug(f"Stored bundled result for bundle_id {bundle_request_id[:15]}")
    
    def get_bundled_result(self, bundle_request_id: str) -> Optional[ToolResult]:
        """
        Get a bundled result.
        
        Args:
            bundle_request_id: Bundle request ID to look up
            
        Returns:
            ToolResult if found, None otherwise
        """
        return self._bundled_results.get(bundle_request_id)
    
    def remove_bundled_result(self, bundle_request_id: str) -> bool:
        """
        Remove a bundled result.
        
        Args:
            bundle_request_id: Bundle request ID to remove
            
        Returns:
            True if result was found and removed, False otherwise
        """
        result = self._bundled_results.pop(bundle_request_id, None)
        if result is not None:
            self._bundle_timestamps.pop(bundle_request_id, None)
            logger.debug(f"Removed bundled result for bundle_id {bundle_request_id[:15]}")
            return True
        return False
    
    def create_bundle_future(self, bundle_id: str) -> asyncio.Future:
        """
        Create a future for waiting on a bundle result.
        
        Args:
            bundle_id: Bundle ID for the future
            
        Returns:
            asyncio.Future that will be resolved when the bundle result arrives
        """
        future = asyncio.Future()
        self._bundle_futures[bundle_id] = future
        self._bundle_futures_dict[bundle_id] = future
        logger.debug(f"Created bundle future for bundle_id {bundle_id[:15]}")
        return future
    
    def resolve_bundle_future(self, bundle_id: str, result: ToolResult) -> bool:
        """
        Resolve a waiting bundle future with a bundle result.
        
        Args:
            bundle_id: Bundle ID of the future to resolve
            result: Bundle result to set as the future's result
            
        Returns:
            True if future was found and resolved, False otherwise
        """
        future = self._bundle_futures_dict.get(bundle_id)
        if future and not future.done():
            future.set_result(result)
            # Clean up from tracking dict (future may still be in weak dict)
            self._bundle_futures_dict.pop(bundle_id, None)
            logger.debug(f"Resolved bundle future for bundle_id {bundle_id[:15]}")
            return True
        return False
    
    def get_bundle_future(self, bundle_id: str) -> Optional[asyncio.Future]:
        """
        Get a bundle future if it exists.
        
        Args:
            bundle_id: Bundle ID to look up
            
        Returns:
            asyncio.Future if found, None otherwise
        """
        return self._bundle_futures_dict.get(bundle_id)
    
    def remove_bundle_future(self, bundle_id: str) -> bool:
        """
        Remove a bundle future.
        
        Args:
            bundle_id: Bundle ID to remove
            
        Returns:
            True if future was found and removed, False otherwise
        """
        future = self._bundle_futures_dict.pop(bundle_id, None)
        if future is not None:
            # Weak dict will clean up automatically
            logger.debug(f"Removed bundle future for bundle_id {bundle_id[:15]}")
            return True
        return False
    
    def cleanup_old_results(self, max_age_seconds: Optional[int] = None) -> int:
        """
        Clean up old results based on TTL.
        
        Args:
            max_age_seconds: Maximum age in seconds (defaults to cleanup_ttl_seconds)
            
        Returns:
            Number of results cleaned up
        """
        if max_age_seconds is None:
            max_age_seconds = self._cleanup_ttl
        
        current_time = time.time()
        cleaned_count = 0
        
        # Clean up old pending results
        expired_request_ids = [
            req_id for req_id, timestamp in self._result_timestamps.items()
            if current_time - timestamp > max_age_seconds
        ]
        for request_id in expired_request_ids:
            self.remove_pending_result(request_id)
            self.remove_result_future(request_id)
            cleaned_count += 1
        
        # Clean up old bundled results
        expired_bundle_ids = [
            bundle_id for bundle_id, timestamp in self._bundle_timestamps.items()
            if current_time - timestamp > max_age_seconds
        ]
        for bundle_id in expired_bundle_ids:
            self.remove_bundled_result(bundle_id)
            cleaned_count += 1
        
        if cleaned_count > 0:
            logger.info(f"Cleaned up {cleaned_count} old tool results (TTL: {max_age_seconds}s)")
        
        return cleaned_count
    
    def cleanup_request_ids(self, request_ids: set[str]) -> int:
        """
        Clean up specific request IDs (used after processing).
        
        Args:
            request_ids: Set of request IDs to clean up
            
        Returns:
            Number of results cleaned up
        """
        cleaned_count = 0
        for request_id in request_ids:
            if self.remove_pending_result(request_id):
                cleaned_count += 1
            if self.remove_result_future(request_id):
                cleaned_count += 1
        
        return cleaned_count
    
    def clear_all(self) -> None:
        """Clear all stored results (used for session cleanup)."""
        self._pending_results.clear()
        self._result_futures.clear()
        self._futures_dict.clear()
        self._bundled_results.clear()
        self._bundle_futures.clear()
        self._bundle_futures_dict.clear()
        self._result_timestamps.clear()
        self._bundle_timestamps.clear()
        logger.debug("Cleared all tool result storage")
    
    def get_stats(self) -> Dict[str, int]:
        """
        Get storage statistics.
        
        Returns:
            Dictionary with counts of stored items
        """
        return {
            "pending_results": len(self._pending_results),
            "result_futures": len(self._futures_dict),
            "bundled_results": len(self._bundled_results),
            "bundle_futures": len(self._bundle_futures_dict),
        }
