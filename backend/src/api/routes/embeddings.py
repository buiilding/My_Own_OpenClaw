"""
Embeddings API Routes.

REST endpoints for embedding operations used by the frontend memory system.
"""

import logging
import time
from typing import Dict, Any, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.src.api.deps import get_container, ContainerDep

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])
logger = logging.getLogger(__name__)


class EmbeddingRequest(BaseModel):
    """Request model for embedding generation."""
    text: str
    model_name: str = "default"  # Optional model specification


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

        # Generate embedding
        embedding = embedding_provider.embed_text(request.text)
        embedding_time = time.perf_counter() - embedding_start_time

        # Convert to list for JSON serialization
        embedding_list = embedding.tolist() if hasattr(embedding, 'tolist') else list(embedding)

        logger.info(f"[Timing] Embedding generation completed in {embedding_time:.3f}s (length: {len(request.text)} chars, model: {request.model_name})")

        return EmbeddingResponse(
            embedding=embedding_list,
            model_name=getattr(embedding_provider, 'model_name', request.model_name),
            dimension=len(embedding_list)
        )

    except Exception as e:
        embedding_time = time.perf_counter() - embedding_start_time
        logger.error(f"[Timing] Embedding generation failed after {embedding_time:.3f}s: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Embedding generation failed: {str(e)}"
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
    try:
        embedding_provider = container.embedder
        if not embedding_provider:
            return {
                "status": "unhealthy",
                "message": "Embedding provider not available"
            }

        # Try a simple embedding to verify functionality
        test_embedding = embedding_provider.embed_text("test")
        dimension = len(test_embedding.tolist() if hasattr(test_embedding, 'tolist') else list(test_embedding))

        return {
            "status": "healthy",
            "model_name": getattr(embedding_provider, 'model_name', 'unknown'),
            "dimension": dimension
        }

    except Exception as e:
        logger.error(f"Embeddings health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }