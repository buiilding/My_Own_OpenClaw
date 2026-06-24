"""Standalone internal embedding service app."""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from secrets import compare_digest
from typing import Annotated, Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.src.api.routes.memory.embeddings.service import (
    embedding_to_list,
    raise_embedding_error,
    resolve_embedding_space_version,
)
from backend.src.api.routes.memory.health import healthy_payload
from backend.src.core.bootstrap.entrypoint import initialize_entrypoint_logger
from backend.src.core.config.loader import load_settings_from_file
from backend.src.core.config.models import AppConfig
from backend.src.core.container.factories import (
    _create_local_sentence_transformer_provider,
)
from backend.src.embeddings.errors import (
    EmbeddingCapacityExceededError,
    EmbeddingProviderRequestError,
)
from backend.src.embeddings.limited_provider import CapacityLimitedEmbeddingProvider

logger = initialize_entrypoint_logger(__name__)

MAX_EMBED_TEXT_CHARS = 8192
MAX_EMBED_TOTAL_CHARS = 65536
EMBEDDING_SERVICE_API_KEY_ENV = "WINDIE_EMBEDDING_SERVICE_API_KEY"
EMBEDDING_SERVICE_API_KEY_HEADER = "x-windie-embedding-key"


class EmbedRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texts: list[
        Annotated[str, Field(min_length=1, max_length=MAX_EMBED_TEXT_CHARS)]
    ] = Field(min_length=1, max_length=256)

    @model_validator(mode="after")
    def validate_total_text_size(self) -> "EmbedRequest":
        total_chars = sum(len(text) for text in self.texts)
        if total_chars > MAX_EMBED_TOTAL_CHARS:
            raise ValueError(
                f"Total embedded text length exceeds {MAX_EMBED_TOTAL_CHARS} characters"
            )
        return self


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    provider_id: str
    model_id: str
    model_name: str
    dimension: int
    embedding_space_version: str
    queue_wait_ms: float
    service_time_ms: float


def _build_provider(config: AppConfig):
    provider = _create_local_sentence_transformer_provider(config, cache_manager=None)
    if provider is None:
        return None
    return CapacityLimitedEmbeddingProvider(
        provider,
        max_concurrent_requests=config.embedding_max_concurrent_requests,
        queue_timeout_seconds=config.embedding_queue_timeout_seconds,
        label="embedding-service",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = load_settings_from_file()
    provider = _build_provider(config)
    app.state.config = config
    app.state.embedding_provider = provider
    if provider is not None:
        await provider.initialize()
    try:
        yield
    finally:
        if provider is not None:
            close = getattr(provider, "close", None)
            if callable(close):
                await close()


app = FastAPI(title="WindieOS Embedding Service", lifespan=lifespan)


def _get_provider() -> Any:
    provider = getattr(app.state, "embedding_provider", None)
    if provider is None:
        raise HTTPException(status_code=503, detail="Embedding provider not available")
    return provider


def _resolve_expected_embedding_service_api_key() -> str:
    token = os.getenv(EMBEDDING_SERVICE_API_KEY_ENV, "").strip()
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Embedding service authentication is not configured",
        )
    return token


def _require_embedding_service_api_key(
    api_key: Annotated[
        Optional[str], Header(alias=EMBEDDING_SERVICE_API_KEY_HEADER)
    ] = None,
) -> None:
    expected_api_key = _resolve_expected_embedding_service_api_key()
    provided_api_key = api_key.strip() if isinstance(api_key, str) else ""
    if not provided_api_key:
        raise HTTPException(
            status_code=401, detail="Missing embedding service credentials"
        )
    if not compare_digest(provided_api_key, expected_api_key):
        raise HTTPException(
            status_code=403, detail="Invalid embedding service credentials"
        )


@app.post(
    "/embed",
    response_model=EmbedResponse,
    dependencies=[Depends(_require_embedding_service_api_key)],
)
async def embed(payload: EmbedRequest) -> EmbedResponse:
    provider = _get_provider()
    started_at = time.perf_counter()
    queue_wait_ms = 0.0
    try:
        gate = getattr(provider, "_gate", None)
        if gate is not None and hasattr(gate, "acquire"):
            async with gate.acquire() as queue_wait_seconds:
                queue_wait_ms = queue_wait_seconds * 1000.0
                embeddings = await provider.provider.embed_batch(payload.texts)
        else:
            embeddings = await provider.embed_batch(payload.texts)
        service_time_ms = (time.perf_counter() - started_at) * 1000.0
        embedding_lists = [embedding_to_list(embedding) for embedding in embeddings]
        return EmbedResponse(
            embeddings=embedding_lists,
            provider_id=getattr(provider, "provider_id", "unknown-provider"),
            model_id=getattr(provider, "model_id", "unknown-model"),
            model_name=getattr(
                provider, "model_name", getattr(provider, "model_id", "unknown-model")
            ),
            dimension=len(embedding_lists[0]),
            embedding_space_version=resolve_embedding_space_version(provider),
            queue_wait_ms=queue_wait_ms,
            service_time_ms=service_time_ms,
        )
    except EmbeddingCapacityExceededError as error:
        raise HTTPException(status_code=503, detail=error.detail) from error
    except EmbeddingProviderRequestError as error:
        raise HTTPException(
            status_code=error.status_code, detail=error.detail
        ) from error
    except Exception as error:
        raise_embedding_error(error=error, logger=logger, started_at=started_at)


@app.get("/health")
async def health() -> dict[str, Any]:
    provider = _get_provider()
    try:
        return healthy_payload(
            provider_id=getattr(provider, "provider_id", "unknown-provider"),
            model_id=getattr(provider, "model_id", "unknown-model"),
            model_name=getattr(
                provider, "model_name", getattr(provider, "model_id", "unknown-model")
            ),
            dimension=getattr(provider, "dimension", 0),
            embedding_space_version=resolve_embedding_space_version(provider),
        )
    except Exception as error:
        logger.error("Embedding service health check failed: %s", error, exc_info=True)
        raise HTTPException(
            status_code=503, detail="Embedding service unhealthy"
        ) from error
