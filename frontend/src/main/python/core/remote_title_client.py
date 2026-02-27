"""
Remote Title Client

Client for calling the backend conversation title API from the frontend memory system.
"""

import aiohttp
from typing import Optional

from core.remote_api_client_base import RemoteApiClientBase


class RemoteTitleClient(RemoteApiClientBase):
    """Client for remote model-based conversation title generation."""

    _aiohttp = aiohttp

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 45):
        super().__init__(backend_url=backend_url, timeout_seconds=timeout_seconds)

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

        data = await self._post_success_json(
            path="/api/semantic/title",
            payload=payload,
            api_label="Title",
            network_service_label="title",
            request_error_label="conversation title",
        )
        title = data.get("title", "") or ""
        return title.strip()
