"""Remote HTTP embedding provider."""

from __future__ import annotations

import asyncio
from typing import Any, List, Optional

import httpx
import numpy as np

from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.errors import (
    EmbeddingCapacityExceededError,
    EmbeddingProviderRequestError,
)


class RemoteHttpEmbeddingProvider(EmbeddingProvider):
    """Embedding provider backed by an internal HTTP embedding service."""

    def __init__(
        self,
        *,
        service_url: str,
        model_id: Optional[str] = None,
        timeout_seconds: float = 30.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self._configured_model_id = (
            model_id.strip()
            if isinstance(model_id, str) and model_id.strip()
            else "unknown"
        )
        self._timeout_seconds = timeout_seconds
        self._client = http_client
        self._client_lock = asyncio.Lock()
        self._provider_id = "remote-http"
        self._model_id = self._configured_model_id
        self._dimension: Optional[int] = None
        self._embedding_space_version: Optional[str] = None

    async def initialize(self) -> None:
        await self._get_client()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def health_check(self) -> bool:
        client = await self._get_client()
        try:
            response = await client.get("/health")
        except httpx.HTTPError:
            return False
        if response.status_code != 200:
            return False
        body = self._validate_health_body(response.json())
        self._update_metadata(body)
        return body.get("status") == "healthy"

    @property
    def provider_id(self) -> str:
        return self._provider_id

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def model_name(self) -> str:
        return self._model_id

    @property
    def dimension(self) -> int:
        return self._dimension or 0

    @property
    def embedding_space_version(self) -> Optional[str]:
        return self._embedding_space_version

    async def embed_text(self, text: str) -> np.ndarray:
        embeddings = await self.embed_batch([text])
        return embeddings[0]

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        client = await self._get_client()
        payload = {"texts": texts}
        try:
            response = await client.post("/embed", json=payload)
        except httpx.TimeoutException as error:
            raise EmbeddingProviderRequestError(
                status_code=504,
                detail="Remote embedding service timed out",
            ) from error
        except httpx.HTTPError as error:
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail=f"Remote embedding service request failed: {error}",
            ) from error

        if response.status_code in {429, 503}:
            detail = self._extract_error_detail(response)
            raise EmbeddingCapacityExceededError(detail)
        if response.status_code != 200:
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail=self._extract_error_detail(response),
            )

        body = self._validate_response_body(response.json())
        self._update_metadata(body)
        raw_embeddings = body["embeddings"]
        return [np.asarray(vector, dtype=np.float32) for vector in raw_embeddings]

    async def _get_client(self) -> httpx.AsyncClient:
        async with self._client_lock:
            if self._client is None:
                self._client = httpx.AsyncClient(
                    base_url=self._service_url,
                    timeout=self._timeout_seconds,
                )
            return self._client

    def _update_metadata(self, payload: dict[str, Any]) -> None:
        provider_id = payload.get("provider_id")
        model_id = payload.get("model_id")
        dimension = payload.get("dimension")
        embedding_space_version = payload.get("embedding_space_version")
        if isinstance(provider_id, str) and provider_id.strip():
            self._provider_id = provider_id.strip()
        if isinstance(model_id, str) and model_id.strip():
            self._model_id = model_id.strip()
        if isinstance(dimension, int) and dimension > 0:
            self._dimension = dimension
        if isinstance(embedding_space_version, str) and embedding_space_version.strip():
            self._embedding_space_version = embedding_space_version.strip()

    @staticmethod
    def _extract_error_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            detail = body.get("detail") or body.get("message")
            if isinstance(detail, str) and detail.strip():
                return detail.strip()
        text = response.text.strip()
        if text:
            return text
        return f"Remote embedding service returned {response.status_code}"

    @staticmethod
    def _validate_response_body(body: Any) -> dict[str, Any]:
        if not isinstance(body, dict):
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail="Remote embedding service returned a non-object payload",
            )
        embeddings = body.get("embeddings")
        if not isinstance(embeddings, list) or not embeddings:
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail="Remote embedding service returned no embeddings",
            )
        return body

    @staticmethod
    def _validate_health_body(body: Any) -> dict[str, Any]:
        if not isinstance(body, dict):
            return {}
        return body
