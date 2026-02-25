"""
Embeddings API Routes.

REST endpoints for embedding operations used by the frontend memory system.
"""

import logging
import time
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.src.api.deps import ContainerDep
from backend.src.api.routes.memory.health import (
    dependency_health_check,
    healthy_payload,
)

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])
logger = logging.getLogger(__name__)


def _embedding_to_list(embedding) -> List[float]:
    """
    Convert embedding to list, handling numpy arrays and other iterables.
    
    Args:
        embedding: Embedding vector (numpy array, list, or other iterable)
        
    Returns:
        List of floats representing the embedding vector
    """
    try:
        return embedding.tolist()
    except AttributeError:
        return list(embedding)


class EmbeddingRequest(BaseModel):
    """Request model for embedding generation."""
    # FIX: Add constraints to prevent DoS
    text: str = Field(..., min_length=1, max_length=8192, description="Text to embed")
    model_name: str = Field(default="default", min_length=1, max_length=128, description="Model name for embedding generation")


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation."""
    embedding: List[float]
    model_name: str
    dimension: int


@router.post("/", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    container: ContainerDep
) -> EmbeddingResponse:
    """
    Generate embeddings for the given text.

    This endpoint is used by the frontend memory system to generate
    embeddings for text before storing in the local FAISS index.

    Args:
        request: Embedding request with text and optional model name
        container: Application container with access to embedding provider

    Returns:
        Embedding response with vector, model name, and dimension

    Raises:
        HTTPException: If embedding generation fails
    """
    embedding_start_time = time.perf_counter()
    try:
        # Get the embedding provider from container
        embedding_provider = container.embedder
        if not embedding_provider:
            raise HTTPException(
                status_code=503,
                detail="Embedding service not available"
            )

        # Generate embedding (async method offloads blocking operations)
        embedding = await embedding_provider.embed_text(request.text)
        embedding_time = time.perf_counter() - embedding_start_time

        # Convert to list for JSON serialization
        embedding_list = _embedding_to_list(embedding)

        logger.info(f"[Timing] Embedding generation completed in {embedding_time:.3f}s (length: {len(request.text)} chars, model: {request.model_name})")

        return EmbeddingResponse(
            embedding=embedding_list,
            model_name=getattr(embedding_provider, 'model_name', request.model_name),
            dimension=len(embedding_list)
        )

    except HTTPException:
        # Re-raise HTTPExceptions to preserve status codes (e.g., 503 Service Unavailable)
        raise
    except Exception as e:
        embedding_time = time.perf_counter() - embedding_start_time
        logger.error(f"[Timing] Embedding generation failed after {embedding_time:.3f}s: {e}", exc_info=True)
        # Sanitize error message to prevent information leakage
        # Full details are logged server-side above
        raise HTTPException(
            status_code=500,
            detail="Embedding generation failed: An internal error occurred"
        )


@router.get("/health")
async def health_check(
    container: ContainerDep
) -> Dict[str, Any]:
    """
    Health check for the embeddings service.

    Returns:
        Health status information
    """
    async def _healthy_payload_for_provider(embedding_provider) -> Dict[str, Any]:
        # Run a real probe call so health reflects runtime embedder readiness.
        test_embedding = await embedding_provider.embed_text("test")
        dimension = len(_embedding_to_list(test_embedding))
        return healthy_payload(
            model_name=getattr(embedding_provider, 'model_name', 'unknown'),
            dimension=dimension,
        )

    return await dependency_health_check(
        dependency=None,
        get_dependency=lambda: container.embedder,
        missing_message="Embedding provider not available",
        on_healthy=_healthy_payload_for_provider,
        logger=logger,
        error_log_prefix="Embeddings health check failed",
    )
