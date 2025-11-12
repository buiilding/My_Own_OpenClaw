"""
Memory Module - Local Mem0 implementation for persistent memory.

This module provides episodic and semantic memory storage with complete
privacy - all data and embeddings are generated and stored locally.
"""
from backend.memory.memory_manager import (
    MemoryManager,
    end_session,
    get_memory_store,
    run_summarization_periodically,
    start_session,
)
from backend.memory.retrieval import MemorySummarizer, SemanticRetrieval
from backend.memory.schemas import EpisodicMemory, SemanticMemory
from backend.memory.storage import LocalMemoryStore

__all__ = [
    "LocalMemoryStore",
    "MemoryManager",
    "MemorySummarizer",
    "SemanticRetrieval",
    "EpisodicMemory",
    "SemanticMemory",
    "get_memory_store",
    "start_session",
    "end_session",
    "run_summarization_periodically",
]
