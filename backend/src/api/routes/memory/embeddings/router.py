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


def _log_embedding_route_start(*, text: str, model_name: str) -> float:
    started_at = time.perf_counter()
    logger.info(
        "[MemoryRoute] /api/embeddings start chars=%s model=%s",
        len(text),
        model_name,
    )
    return started_at


def _log_embedding_route_success(
    *,
    started_at: float,
    text: str,
    model_name: str,
    dimension: int,
) -> None:
    logger.info(
        "[MemoryRoute] /api/embeddings success chars=%s model=%s dimension=%s duration=%.3fs",
        len(text),
        model_name,
        dimension,
        time.perf_counter() - started_at,
    )


def _log_embedding_route_failure(
    *,
    started_at: float,
    text: str,
    model_name: str,
    error: Exception,
    status_code: int | None = None,
) -> None:
    if status_code is None:
        logger.error(
            "[MemoryRoute] /api/embeddings failure chars=%s model=%s duration=%.3fs error=%s",
            len(text),
            model_name,
            time.perf_counter() - started_at,
            error,
            exc_info=True,
        )
        return
    logger.warning(
        "[MemoryRoute] /api/embeddings failure chars=%s model=%s status=%s duration=%.3fs error=%s",
        len(text),
        model_name,
        status_code,
        time.perf_counter() - started_at,
        error,
    )


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
    route_started_at = _log_embedding_route_start(
        text=request.text,
        model_name=request.model_name,
    )
    try:
        embedding_provider = container.embedder
        if not embedding_provider:
            error = HTTPException(
                status_code=503,
                detail="Embedding service not available",
            )
            _log_embedding_route_failure(
                started_at=route_started_at,
                text=request.text,
                model_name=request.model_name,
                error=error,
                status_code=error.status_code,
            )
            raise error
        response = await generate_embedding_response(
            request_text=request.text,
            request_model_name=request.model_name,
            embedding_provider=embedding_provider,
            logger=logger,
        )
        _log_embedding_route_success(
            started_at=route_started_at,
            text=request.text,
            model_name=request.model_name,
            dimension=response.dimension,
        )
        return response
    except HTTPException as error:
        _log_embedding_route_failure(
            started_at=route_started_at,
            text=request.text,
            model_name=request.model_name,
            error=error,
            status_code=error.status_code,
        )
        raise
    except Exception as error:
        _log_embedding_route_failure(
            started_at=route_started_at,
            text=request.text,
            model_name=request.model_name,
            error=error,
        )
        raise_embedding_error(error=error, logger=logger, started_at=route_started_at)


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
