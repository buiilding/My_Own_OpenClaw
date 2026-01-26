"""
Memory-related API routes.

This package contains REST endpoints for memory operations:
- Embeddings: Vector embedding generation for memory storage
- Semantic: Semantic memory summarization from episodic memories
"""

from . import embeddings, semantic

__all__ = ["embeddings", "semantic"]
