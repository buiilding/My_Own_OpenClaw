"""
Remote Embedding Client

Client for calling the backend embedding API from the frontend memory system.
"""

import logging

import aiohttp
import numpy as np

from core.remote_api_client_base import RemoteApiClientBase
from core.unicode_sanitizer import sanitize_surrogates_in_text

logger = logging.getLogger(__name__)

EMBEDDING_TEXT_MAX_LENGTH = 8192
DEFAULT_EMBEDDING_DIMENSION = 384


class RemoteEmbeddingClient(RemoteApiClientBase):
    """
    Client for remote embedding generation via backend API.

    This replaces the local EmbeddingProvider in the frontend memory system.
    """

    _aiohttp = aiohttp

    def __init__(self, backend_url: str | None = None):
        """
        Initialize the remote embedding client.

        Args:
            backend_url: Base URL of the backend API
        """
        super().__init__(backend_url=backend_url, timeout_seconds=30)
        self._provider_id: str | None = None
        self._model_id: str | None = None
        self._model_name: str | None = None
        self._embedding_dimension: int | None = None
        self._embedding_space_version: str | None = None

    def _update_embedding_space_metadata(self, payload: dict) -> None:
        provider_id = payload.get("provider_id")
        model_id = payload.get("model_id")
        model_name = payload.get("model_name")
        dimension = payload.get("dimension")
        embedding_space_version = payload.get("embedding_space_version")

        if isinstance(provider_id, str) and provider_id.strip():
            self._provider_id = provider_id.strip()
        if isinstance(model_id, str) and model_id.strip():
            self._model_id = model_id.strip()
        if isinstance(model_name, str) and model_name.strip():
            self._model_name = model_name.strip()
        if isinstance(dimension, int) and dimension > 0:
            self._embedding_dimension = dimension
        if isinstance(embedding_space_version, str) and embedding_space_version.strip():
            self._embedding_space_version = embedding_space_version.strip()

    def get_embedding_space_metadata(self) -> dict | None:
        if (
            not self._provider_id
            or not self._model_id
            or not self._embedding_dimension
            or not self._embedding_space_version
        ):
            return None
        return {
            "embedding_provider_id": self._provider_id,
            "embedding_model_id": self._model_id,
            "embedding_dimension": self._embedding_dimension,
            "embedding_space_version": self._embedding_space_version,
        }

    async def embed_text(self, text: str) -> np.ndarray:
        """
        Generate embedding for text by calling the backend API.

        Args:
            text: Text to embed

        Returns:
            Numpy array of embedding vector

        Raises:
            Exception: If the API call fails
        """
        if not self._session:
            await self.initialize()

        sanitized_text = sanitize_surrogates_in_text(text)
        if len(sanitized_text) > EMBEDDING_TEXT_MAX_LENGTH:
            logger.warning(
                "Embedding text truncated from %s to %s characters before request",
                len(sanitized_text),
                EMBEDDING_TEXT_MAX_LENGTH,
            )
            sanitized_text = sanitized_text[:EMBEDDING_TEXT_MAX_LENGTH]
        payload = {"text": sanitized_text, "model_name": "default"}

        for index, backend_url in enumerate(self.backend_urls):
            try:
                async with self._session.post(
                    f"{backend_url}/api/embeddings/",
                    json=payload,
                    headers=self._build_auth_headers(),
                    timeout=aiohttp.ClientTimeout(total=self.timeout_seconds),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        if self._should_try_fallback_for_status(
                            response.status
                        ) and index + 1 < len(self.backend_urls):
                            logger.warning(
                                "Embedding API at %s returned HTTP %s; trying fallback %s",
                                backend_url,
                                response.status,
                                self.backend_urls[index + 1],
                            )
                            continue
                        raise Exception(
                            f"Embedding API returned {response.status}: {error_text}"
                        )

                    data = await response.json()
                    self._update_embedding_space_metadata(data)

                    # Convert to numpy array
                    embedding = np.array(data["embedding"], dtype=np.float32)
                    self.backend_url = backend_url

                    logger.debug(
                        f"Generated remote embedding, dimension: {len(embedding)}"
                    )

                    return embedding

            except aiohttp.ClientError as e:
                if index + 1 < len(self.backend_urls):
                    logger.warning(
                        "Network error calling embedding API at %s: %s; trying fallback %s",
                        backend_url,
                        e,
                        self.backend_urls[index + 1],
                    )
                    continue
                logger.error(f"Network error calling embedding API: {e}")
                raise Exception(f"Failed to connect to embedding service: {e}") from e
            except Exception as e:
                logger.error(f"Error generating remote embedding: {e}")
                raise

        raise Exception("Failed to connect to embedding service")

    @property
    def dimension(self) -> int:
        """
        Get the embedding dimension.

        Uses the most recent backend metadata when available.
        """
        return self._embedding_dimension or DEFAULT_EMBEDDING_DIMENSION

    @property
    def provider_id(self) -> str | None:
        return self._provider_id

    @property
    def model_id(self) -> str | None:
        return self._model_id

    @property
    def embedding_space_version(self) -> str | None:
        return self._embedding_space_version

    async def refresh_embedding_space(self) -> dict | None:
        if await self.health_check():
            return self.get_embedding_space_metadata()
        return None

    async def health_check(self) -> bool:
        """
        Check if the backend embedding service is healthy.

        Returns:
            True if healthy, False otherwise
        """
        if not self._session:
            await self.initialize()

        for index, backend_url in enumerate(self.backend_urls):
            try:
                async with self._session.get(
                    f"{backend_url}/api/embeddings/health",
                    headers=self._build_auth_headers(),
                    timeout=aiohttp.ClientTimeout(total=5),
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("status") == "healthy":
                            self._update_embedding_space_metadata(data)
                            self.backend_url = backend_url
                            return True
                    if index + 1 < len(self.backend_urls):
                        continue
                    return False

            except Exception as e:
                if index + 1 < len(self.backend_urls):
                    logger.warning(
                        "Embedding service health check failed at %s: %s; trying fallback %s",
                        backend_url,
                        e,
                        self.backend_urls[index + 1],
                    )
                    continue
                logger.error(f"Embedding service health check failed: {e}")
                return False

        return False
