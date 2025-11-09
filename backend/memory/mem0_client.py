"""
Mem0 Client Compatibility Layer - Provides Mem0-like API using local storage.

This module provides backward compatibility with the old Mem0 API client
by wrapping the LocalMemoryStore implementation.
"""
import logging
from typing import Any, Dict, List, Optional

from backend.config import get_settings
from backend.memory.local_store import LocalMemoryStore, get_memory_store

logger = logging.getLogger(__name__)


class Mem0Client:
    """
    Compatibility wrapper for Mem0 API using local storage.

    This class provides the same interface as the external Mem0 client
    but uses LocalMemoryStore internally.
    """

    def __init__(self):
        """Initialize the compatibility client."""
        cfg = get_settings()
        if not cfg.memory_enabled:
            raise ValueError("Memory system is disabled in configuration")

        self.memory_store = get_memory_store(cfg)
        logger.info("Initialized Mem0 compatibility client with local storage")

    def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Add a memory entry (compatibility method).

        Args:
            text: Content to store
            user_id: User identifier
            metadata: Optional metadata dictionary

        Returns:
            Memory ID string
        """
        return self.memory_store.add(text, user_id, metadata)

    def search(
        self,
        query: str,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Search memories (compatibility method).

        Args:
            query: Search query text
            user_id: User identifier
            filters: Optional metadata filters
            limit: Maximum number of results

        Returns:
            List of memory dictionaries
        """
        return self.memory_store.search(query, user_id, filters, limit)

    def update(self, memory_id: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Update memory metadata (compatibility method).

        Args:
            memory_id: Memory ID to update
            metadata: New metadata dictionary

        Returns:
            True if update successful
        """
        return self.memory_store.update(memory_id, metadata)

    def delete(self, memory_id: str) -> bool:
        """
        Delete a memory (compatibility method).

        Args:
            memory_id: Memory ID to delete

        Returns:
            True if deletion successful
        """
        return self.memory_store.delete(memory_id)


# Singleton instance
_client_instance: Optional[Mem0Client] = None


def get_mem0_client() -> Mem0Client:
    """
    Get or create the Mem0 client instance (compatibility function).

    Returns:
        Mem0Client instance
    """
    global _client_instance

    if _client_instance is None:
        _client_instance = Mem0Client()

    return _client_instance
