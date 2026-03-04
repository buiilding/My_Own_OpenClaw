"""Shared base for backend-backed sidecar HTTP clients."""

from __future__ import annotations

import logging
from typing import Any, Optional

import aiohttp

from core.backend_config import get_backend_http_url
from core.unicode_sanitizer import sanitize_surrogates

logger = logging.getLogger(__name__)


class RemoteApiClientBase:
    """Common session lifecycle + JSON POST success/error handling."""

    _aiohttp = aiohttp

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 60):
        self.backend_url = (backend_url or get_backend_http_url()).rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._session: Optional[aiohttp.ClientSession] = None

    async def initialize(self) -> None:
        if self._session is None:
            self._session = self._aiohttp.ClientSession()

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    async def _post_success_json(
        self,
        *,
        path: str,
        payload: dict[str, Any],
        api_label: str,
        network_service_label: str,
        request_error_label: str,
    ) -> dict[str, Any]:
        if not self._session:
            await self.initialize()

        try:
            sanitized_payload = sanitize_surrogates(payload)
            async with self._session.post(
                f"{self.backend_url}{path}",
                json=sanitized_payload,
                timeout=self._aiohttp.ClientTimeout(total=self.timeout_seconds),
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"{api_label} API returned {response.status}: {error_text}")

                data = await response.json()
                if not data.get("success"):
                    raise Exception(f"{api_label} API returned success=false")

                return data
        except self._aiohttp.ClientError as err:
            logger.error("Network error calling %s API: %s", api_label.lower(), err)
            raise Exception(
                f"Failed to connect to {network_service_label} service: {err}"
            ) from err
        except Exception as err:
            logger.error("Error requesting %s: %s", request_error_label, err)
            raise
