"""OpenAI embedding provider."""

from __future__ import annotations

from typing import Any, List, Optional

import numpy as np

from backend.src.core.interfaces.embedding import EmbeddingProvider
from backend.src.embeddings.errors import EmbeddingProviderRequestError


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """Embedding provider backed by OpenAI's embeddings API."""

    def __init__(
        self,
        *,
        api_key: str,
        model_id: str = "text-embedding-3-small",
        timeout_seconds: float = 30.0,
        client: Any | None = None,
    ) -> None:
        normalized_api_key = api_key.strip() if isinstance(api_key, str) else ""
        if not normalized_api_key:
            raise ValueError("OpenAIEmbeddingProvider requires an api_key")
        self._api_key = normalized_api_key
        self._model_id = (
            model_id.strip()
            if isinstance(model_id, str) and model_id.strip()
            else "text-embedding-3-small"
        )
        self._timeout_seconds = timeout_seconds
        self._client = client
        self._dimension: Optional[int] = None

    async def initialize(self) -> None:
        self._get_client()

    @property
    def provider_id(self) -> str:
        return "openai"

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
        if self._dimension is None:
            return None
        return f"{self.provider_id}:{self.model_id}:{self._dimension}"

    async def embed_text(self, text: str) -> np.ndarray:
        embeddings = await self.embed_batch([text])
        return embeddings[0]

    async def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        if not texts:
            raise EmbeddingProviderRequestError(
                status_code=400,
                detail="Embedding request must include at least one text",
            )
        try:
            response = await self._get_client().embeddings.create(
                model=self._model_id,
                input=texts,
            )
        except Exception as error:
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail=f"OpenAI embedding request failed: {error}",
            ) from error

        data = getattr(response, "data", None)
        if not isinstance(data, list) or len(data) != len(texts):
            raise EmbeddingProviderRequestError(
                status_code=502,
                detail="OpenAI embedding response did not include one vector per input",
            )
        vectors = []
        for item in data:
            vector = getattr(item, "embedding", None)
            if not isinstance(vector, list) or not vector:
                raise EmbeddingProviderRequestError(
                    status_code=502,
                    detail="OpenAI embedding response included an invalid vector",
                )
            vectors.append(np.asarray(vector, dtype=np.float32))
        self._dimension = int(vectors[0].shape[0])
        return vectors

    def _get_client(self) -> Any:
        if self._client is None:
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=self._api_key,
                timeout=self._timeout_seconds,
            )
        return self._client
