"""
Remote Title Client

Client for calling the backend conversation title API from the frontend memory system.
"""

import aiohttp
import logging
from typing import Optional

from core.backend_config import get_backend_http_url

logger = logging.getLogger(__name__)


class RemoteTitleClient:
    """Client for remote model-based conversation title generation."""

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 45):
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

    async def generate_title(
        self,
        *,
        user_id: str,
        user_message: str,
        assistant_message: str,
        model_id: Optional[str] = None,
        model_provider: Optional[str] = None,
    ) -> str:
        """Request model-generated conversation title."""
        if not self._session:
            await self.initialize()

        payload = {
            "user_id": user_id,
            "user_message": user_message,
            "assistant_message": assistant_message,
        }
        if isinstance(model_id, str) and model_id.strip():
            payload["model_id"] = model_id.strip()
        if isinstance(model_provider, str) and model_provider.strip():
            payload["model_provider"] = model_provider.strip()

        try:
            async with self._session.post(
                f"{self.backend_url}/api/semantic/title",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout_seconds),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"Title API returned {response.status}: {error_text}")

                data = await response.json()
                if not data.get("success"):
                    raise Exception("Title API returned success=false")

                title = data.get("title", "") or ""
                return title.strip()

        except aiohttp.ClientError as e:
            logger.error(f"Network error calling title API: {e}")
            raise Exception(f"Failed to connect to title service: {e}")
        except Exception as e:
            logger.error(f"Error requesting conversation title: {e}")
            raise
