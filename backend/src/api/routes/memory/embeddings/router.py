"""
Embeddings API Routes.

REST endpoints for embedding operations used by the frontend memory system.
"""

import logging
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.src.api.deps import ContainerDep
from backend.src.api.routes.memory.health import (
    dependency_health_check,
    healthy_payload,
)
from .models import EmbeddingRequest, EmbeddingResponse
from .service import (
    generate_embedding_response,
    raise_embedding_error,
    resolve_health_payload,
)

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])
logger = logging.getLogger(__name__)


@router.post("/", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    container: ContainerDep,
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
        embedding_provider = container.embedder
        if not embedding_provider:
            raise HTTPException(
                status_code=503,
                detail="Embedding service not available",
            )
        return await generate_embedding_response(
            request_text=request.text,
            request_model_name=request.model_name,
            embedding_provider=embedding_provider,
            logger=logger,
        )

    except HTTPException:
        raise
    except Exception as error:
        raise_embedding_error(error=error, logger=logger, started_at=embedding_start_time)


@router.get("/health")
async def health_check(
    container: ContainerDep,
) -> Dict[str, Any]:
    """
    Health check for the embeddings service.

    Returns:
        Health status information
    """
    return await dependency_health_check(
        dependency=None,
        get_dependency=lambda: container.embedder,
        missing_message="Embedding provider not available",
        on_healthy=lambda embedding_provider: resolve_health_payload(
            embedding_provider=embedding_provider,
            healthy_payload_fn=healthy_payload,
        ),
        logger=logger,
        error_log_prefix="Embeddings health check failed",
    )
