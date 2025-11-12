"""
Memory Storage Module - Storage implementations and interfaces.

Provides local storage implementations for the memory system.
"""

from backend.memory.storage.interface import MemoryInterface
from backend.memory.storage.local_store import LocalMemoryStore

__all__ = [
    "MemoryInterface",
    "LocalMemoryStore",
]
