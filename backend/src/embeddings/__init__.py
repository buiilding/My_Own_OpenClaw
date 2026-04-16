"""Embedding provider domain package."""

# The backend provides embedding generation for the memory system.
# Storage, retrieval, and schema management are handled by the frontend.

from backend.src.embeddings.limited_provider import CapacityLimitedEmbeddingProvider
from backend.src.embeddings.remote_provider import RemoteHttpEmbeddingProvider

__all__ = [
    "CapacityLimitedEmbeddingProvider",
    "RemoteHttpEmbeddingProvider",
]
