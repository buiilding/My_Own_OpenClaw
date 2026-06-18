"""
Embeddings API Routes.

REST endpoints for embedding operations used by local memory clients.
"""

import logging
import re
import time
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.src.api.deps import ContainerDep
from backend.src.api.routes.memory.health import (
    dependency_health_check,
    healthy_payload,
)
from backend.src.core.inference.errors import ProviderCapabilityError

from .models import EmbeddingRequest, EmbeddingResponse
from .service import (
    generate_embedding_response,
    raise_embedding_error,
    resolve_health_payload,
)

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])
logger = logging.getLogger(__name__)
LOG_CONTROL_CHARS_PATTERN = re.compile(r"[\x00-\x1f\x7f]+")
LOG_MODEL_NAME_MAX_CHARS = 128


def _resolve_embedding_provider(container: Any) -> Any:
    embedding_router = getattr(container, "embedding_router", None)
    if embedding_router is None or getattr(embedding_router, "provider", None) is None:
        return None
    return embedding_router


def _sanitize_log_model_name(model_name: str) -> str:
    normalized = LOG_CONTROL_CHARS_PATTERN.sub(" ", str(model_name or "")).strip()
    if not normalized:
        return "default"
    if len(normalized) > LOG_MODEL_NAME_MAX_CHARS:
        return f"{normalized[:LOG_MODEL_NAME_MAX_CHARS - 3].rstrip()}..."
    return normalized


def _log_embedding_route_start(*, text: str, model_name: str) -> float:
    started_at = time.perf_counter()
    safe_model_name = _sanitize_log_model_name(model_name)
    logger.info(
        "[MemoryRoute] /api/embeddings start chars=%s model=%s",
        len(text),
        safe_model_name,
    )
    return started_at


def _log_embedding_route_success(
    *,
    started_at: float,
    text: str,
    model_name: str,
    dimension: int,
) -> None:
    safe_model_name = _sanitize_log_model_name(model_name)
    logger.info(
        "[MemoryRoute] /api/embeddings success chars=%s model=%s dimension=%s duration=%.3fs",
        len(text),
        safe_model_name,
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
    safe_model_name = _sanitize_log_model_name(model_name)
    if status_code is None:
        logger.error(
            "[MemoryRoute] /api/embeddings failure chars=%s model=%s duration=%.3fs error=%s",
            len(text),
            safe_model_name,
            time.perf_counter() - started_at,
            error,
            exc_info=True,
        )
        return
    logger.warning(
        "[MemoryRoute] /api/embeddings failure chars=%s model=%s status=%s duration=%.3fs error=%s",
        len(text),
        safe_model_name,
        status_code,
        time.perf_counter() - started_at,
        error,
    )


def _provider_error_to_http_exception(error: ProviderCapabilityError) -> HTTPException:
    status_code = 503 if error.code in {"provider_unavailable", "circuit_open"} else 502
    return HTTPException(status_code=status_code, detail=error.to_payload())


@router.post("/", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    container: ContainerDep,
) -> EmbeddingResponse:
    """
    Generate embeddings for the given text.

    This endpoint is used by local memory clients to generate
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
        embedding_provider = _resolve_embedding_provider(container)
        if not embedding_provider:
            raise HTTPException(
                status_code=503,
                detail="Embedding service not available",
            )
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
    except ProviderCapabilityError as error:
        http_error = _provider_error_to_http_exception(error)
        _log_embedding_route_failure(
            started_at=route_started_at,
            text=request.text,
            model_name=request.model_name,
            error=error,
            status_code=http_error.status_code,
        )
        raise http_error from error
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
        get_dependency=lambda: _resolve_embedding_provider(container),
        missing_message="Embedding provider not available",
        on_healthy=lambda embedding_provider: resolve_health_payload(
            embedding_provider=embedding_provider,
            healthy_payload_fn=healthy_payload,
        ),
        logger=logger,
        error_log_prefix="Embeddings health check failed",
    )
