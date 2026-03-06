"""Embeddings route package exports."""

from .models import EmbeddingRequest, EmbeddingResponse
from .router import generate_embedding, health_check, logger, router

__all__ = [
    "EmbeddingRequest",
    "EmbeddingResponse",
    "generate_embedding",
    "health_check",
    "logger",
    "router",
]
