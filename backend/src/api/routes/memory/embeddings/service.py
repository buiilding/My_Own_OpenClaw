"""Service helpers for embeddings route handlers."""

from __future__ import annotations

import time
from typing import Any, List

from fastapi import HTTPException

from backend.src.embeddings.embeddings import is_cuda_error
from backend.src.embeddings.errors import (
    EmbeddingCapacityExceededError,
    EmbeddingProviderRequestError,
)

from .models import EmbeddingResponse


def embedding_to_list(embedding: Any) -> List[float]:
    """Convert embedding objects (numpy/list-like) to plain float lists."""
    try:
        return embedding.tolist()
    except AttributeError:
        return list(embedding)


def resolve_embedding_space_version(
    embedding_provider: Any,
    *,
    dimension: int | str | None = None,
) -> str:
    """Return a stable embedding-space version string for index compatibility checks."""
    provider_id = getattr(embedding_provider, "provider_id", "unknown-provider")
    model_id = getattr(
        embedding_provider,
        "model_id",
        getattr(embedding_provider, "model_name", "unknown-model"),
    )
    resolved_dimension = (
        dimension
        if dimension is not None
        else getattr(embedding_provider, "dimension", "unknown-dimension")
    )
    return f"{provider_id}:{model_id}:{resolved_dimension}"


async def generate_embedding_response(
    *,
    request_text: str,
    request_model_name: str,
    embedding_provider: Any,
    logger: Any,
) -> EmbeddingResponse:
    """Generate one embedding response from the provider."""
    embedding_start_time = time.perf_counter()

    embedding = await embed_text_with_runtime_recovery(
        text=request_text,
        embedding_provider=embedding_provider,
        logger=logger,
    )
    embedding_time = time.perf_counter() - embedding_start_time

    embedding_list = embedding_to_list(embedding)
    logger.info(
        "[Timing] Embedding generation completed in %.3fs (length: %s chars, model: %s)",
        embedding_time,
        len(request_text),
        request_model_name,
    )

    dimension = len(embedding_list)
    return EmbeddingResponse(
        embedding=embedding_list,
        provider_id=getattr(embedding_provider, "provider_id", "unknown-provider"),
        model_id=getattr(
            embedding_provider,
            "model_id",
            getattr(embedding_provider, "model_name", request_model_name),
        ),
        model_name=getattr(embedding_provider, "model_name", request_model_name),
        dimension=dimension,
        embedding_space_version=resolve_embedding_space_version(
            embedding_provider,
            dimension=dimension,
        ),
    )


async def resolve_health_payload(
    *, embedding_provider: Any, healthy_payload_fn: Any
) -> dict[str, Any]:
    """Run live provider probe and build health payload."""
    test_embedding = await embed_text_with_runtime_recovery(
        text="test",
        embedding_provider=embedding_provider,
        logger=None,
    )
    dimension = len(embedding_to_list(test_embedding))
    return healthy_payload_fn(
        provider_id=getattr(embedding_provider, "provider_id", "unknown-provider"),
        model_id=getattr(
            embedding_provider,
            "model_id",
            getattr(embedding_provider, "model_name", "unknown"),
        ),
        model_name=getattr(embedding_provider, "model_name", "unknown"),
        dimension=dimension,
        embedding_space_version=resolve_embedding_space_version(
            embedding_provider,
            dimension=dimension,
        ),
    )


async def embed_text_with_runtime_recovery(
    *,
    text: str,
    embedding_provider: Any,
    logger: Any | None,
) -> Any:
    """
    Run one embedding request with a provider-assisted CUDA -> CPU recovery retry.

    The provider already attempts runtime recovery internally, but the HTTP route
    adds one outer retry so transient CUDA allocator failures do not leak as 500s
    when the provider can recover on CPU.
    """
    try:
        return await embedding_provider.embed_text(text)
    except Exception as error:
        recover = getattr(embedding_provider, "recover_from_cuda_runtime_failure", None)
        if (
            not is_cuda_error(error)
            or not callable(recover)
            or not await recover(error)
        ):
            raise
        if logger is not None:
            logger.warning(
                "Embedding provider hit a CUDA runtime failure. Retrying embedding on CPU fallback."
            )
        return await embedding_provider.embed_text(text)


def raise_embedding_error(*, error: Exception, logger: Any, started_at: float) -> None:
    """Emit sanitized internal-error response for embedding failures."""
    if isinstance(error, EmbeddingCapacityExceededError):
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error
    if isinstance(error, EmbeddingProviderRequestError):
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error
    embedding_time = time.perf_counter() - started_at
    logger.error(
        "[Timing] Embedding generation failed after %.3fs: %s",
        embedding_time,
        error,
        exc_info=True,
    )
    raise HTTPException(
        status_code=500,
        detail="Embedding generation failed: An internal error occurred",
    ) from error
