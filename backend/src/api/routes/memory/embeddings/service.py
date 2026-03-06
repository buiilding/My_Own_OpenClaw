"""Service helpers for embeddings route handlers."""

from __future__ import annotations

import time
from typing import Any, List

from fastapi import HTTPException

from .models import EmbeddingResponse


def embedding_to_list(embedding: Any) -> List[float]:
    """Convert embedding objects (numpy/list-like) to plain float lists."""
    try:
        return embedding.tolist()
    except AttributeError:
        return list(embedding)


async def generate_embedding_response(
    *,
    request_text: str,
    request_model_name: str,
    embedding_provider: Any,
    logger: Any,
) -> EmbeddingResponse:
    """Generate one embedding response from the provider."""
    embedding_start_time = time.perf_counter()

    embedding = await embedding_provider.embed_text(request_text)
    embedding_time = time.perf_counter() - embedding_start_time

    embedding_list = embedding_to_list(embedding)
    logger.info(
        "[Timing] Embedding generation completed in %.3fs (length: %s chars, model: %s)",
        embedding_time,
        len(request_text),
        request_model_name,
    )

    return EmbeddingResponse(
        embedding=embedding_list,
        model_name=getattr(embedding_provider, "model_name", request_model_name),
        dimension=len(embedding_list),
    )


async def resolve_health_payload(*, embedding_provider: Any, healthy_payload_fn: Any) -> dict[str, Any]:
    """Run live provider probe and build health payload."""
    test_embedding = await embedding_provider.embed_text("test")
    dimension = len(embedding_to_list(test_embedding))
    return healthy_payload_fn(
        model_name=getattr(embedding_provider, "model_name", "unknown"),
        dimension=dimension,
    )


def raise_embedding_error(*, error: Exception, logger: Any, started_at: float) -> None:
    """Emit sanitized internal-error response for embedding failures."""
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
