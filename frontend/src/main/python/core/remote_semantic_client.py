"""
Remote Semantic Client

Client for calling the backend semantic summarization API from the frontend memory system.
"""

import aiohttp
import logging
from typing import List, Optional, Tuple

from core.backend_config import get_backend_http_url

logger = logging.getLogger(__name__)


class RemoteSemanticClient:
    """
    Client for remote semantic summarization via backend API.
    """

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 60):
        self.backend_url = (backend_url or get_backend_http_url()).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._session: Optional[aiohttp.ClientSession] = None

    async def initialize(self) -> None:
        if self._session is None:
            self._session = aiohttp.ClientSession()

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    async def summarize(self, conversations: List[str], user_id: str) -> Tuple[str, List[str]]:
        """
        Request semantic summarization.

        Returns:
            Tuple of (summary, facts)
        """
        if not self._session:
            await self.initialize()

        payload = {
            "conversations": conversations,
            "user_id": user_id,
        }

        try:
            async with self._session.post(
                f"{self.backend_url}/api/semantic/summarize",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout_seconds),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Semantic API returned {response.status}: {error_text}")

                data = await response.json()
                if not data.get("success"):
                    raise Exception("Semantic API returned success=false")

                summary = data.get("summary", "") or ""
                facts = data.get("facts", []) or []

                return summary, facts

        except aiohttp.ClientError as e:
            logger.error(f"Network error calling semantic API: {e}")
            raise Exception(f"Failed to connect to semantic service: {e}")
        except Exception as e:
            logger.error(f"Error requesting semantic summary: {e}")
            raise
