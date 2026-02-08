"""
Remote Embedding Client

Client for calling the backend embedding API from the frontend memory system.
"""

import aiohttp
import logging
from typing import Optional
import numpy as np

from core.backend_config import get_backend_http_url

logger = logging.getLogger(__name__)


class RemoteEmbeddingClient:
    """
    Client for remote embedding generation via backend API.

    This replaces the local EmbeddingProvider in the frontend memory system.
    """

    def __init__(self, backend_url: Optional[str] = None):
        """
        Initialize the remote embedding client.

        Args:
            backend_url: Base URL of the backend API
        """
        self.backend_url = (backend_url or get_backend_http_url()).rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    async def initialize(self) -> None:
        """Initialize the HTTP session."""
        if self._session is None:
            self._session = aiohttp.ClientSession()

    async def close(self) -> None:
        """Close the HTTP session."""
        if self._session:
            await self._session.close()
            self._session = None

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

        try:
            payload = {
                "text": text,
                "model_name": "default"
            }

            async with self._session.post(
                f"{self.backend_url}/api/embeddings/",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Embedding API returned {response.status}: {error_text}")

                data = await response.json()

                # Convert to numpy array
                embedding = np.array(data["embedding"], dtype=np.float32)

                logger.debug(f"Generated remote embedding, dimension: {len(embedding)}")

                return embedding

        except aiohttp.ClientError as e:
            logger.error(f"Network error calling embedding API: {e}")
            raise Exception(f"Failed to connect to embedding service: {e}")
        except Exception as e:
            logger.error(f"Error generating remote embedding: {e}")
            raise

    @property
    def dimension(self) -> int:
        """
        Get the embedding dimension.

        This makes a test call to determine the dimension.
        """
        # For now, we'll assume a default dimension
        # In a real implementation, we might cache this or make a health check call
        return 384  # Common dimension for many embedding models

    async def health_check(self) -> bool:
        """
        Check if the backend embedding service is healthy.

        Returns:
            True if healthy, False otherwise
        """
        if not self._session:
            await self.initialize()

        try:
            async with self._session.get(
                f"{self.backend_url}/api/embeddings/health",
                timeout=aiohttp.ClientTimeout(total=5)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("status") == "healthy"
                return False

        except Exception as e:
            logger.error(f"Embedding service health check failed: {e}")
            return False
