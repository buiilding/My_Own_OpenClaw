"""
Remote Semantic Client

Client for calling the backend semantic summarization API from the frontend memory system.
"""

import aiohttp
from typing import List, Optional, Tuple

from core.remote_api_client_base import RemoteApiClientBase


class RemoteSemanticClient(RemoteApiClientBase):
    """
    Client for remote semantic summarization via backend API.
    """

    _aiohttp = aiohttp

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 60):
        super().__init__(backend_url=backend_url, timeout_seconds=timeout_seconds)

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

        data = await self._post_success_json(
            path="/api/semantic/summarize",
            payload=payload,
            api_label="Semantic",
            network_service_label="semantic",
            request_error_label="semantic summary",
        )
        summary = data.get("summary", "") or ""
        facts = data.get("facts", []) or []
        return summary, facts
