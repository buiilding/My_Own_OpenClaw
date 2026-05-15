"""Shared base for backend-backed sidecar HTTP clients."""

from __future__ import annotations

import logging
from typing import Any, Optional

import aiohttp

from windie._auth import get_install_bearer_token
from windie._backend_config import get_backend_http_url, get_backend_http_urls
from windie._unicode_sanitizer import sanitize_surrogates

logger = logging.getLogger(__name__)


class RemoteApiClientBase:
    """Common session lifecycle + JSON POST success/error handling."""

    _aiohttp = aiohttp

    def __init__(self, backend_url: Optional[str] = None, timeout_seconds: int = 60):
        self.backend_urls = (
            [(backend_url or get_backend_http_url()).rstrip("/")]
            if backend_url
            else get_backend_http_urls()
        )
        self.backend_url = self.backend_urls[0]
        self.timeout_seconds = timeout_seconds
        self._session: Optional[aiohttp.ClientSession] = None

    async def initialize(self) -> None:
        if self._session is None:
            self._session = self._aiohttp.ClientSession()

    async def close(self) -> None:
        if self._session:
            await self._session.close()
            self._session = None

    def _build_auth_headers(self) -> dict[str, str]:
        token = get_install_bearer_token()
        if not token:
            return {}
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def _should_try_fallback_for_status(status: int) -> bool:
        """Return True when an HTTP status should try the next backend URL."""
        return 500 <= int(status) <= 599

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

        sanitized_payload = sanitize_surrogates(payload)
        last_network_error: Optional[Exception] = None

        for index, backend_url in enumerate(self.backend_urls):
            try:
                async with self._session.post(
                    f"{backend_url}{path}",
                    json=sanitized_payload,
                    headers=self._build_auth_headers(),
                    timeout=self._aiohttp.ClientTimeout(total=self.timeout_seconds),
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        if (
                            self._should_try_fallback_for_status(response.status)
                            and index + 1 < len(self.backend_urls)
                        ):
                            logger.warning(
                                "%s API at %s returned HTTP %s; trying fallback %s",
                                api_label,
                                backend_url,
                                response.status,
                                self.backend_urls[index + 1],
                            )
                            continue
                        raise Exception(f"{api_label} API returned {response.status}: {error_text}")

                    data = await response.json()
                    if not data.get("success"):
                        raise Exception(f"{api_label} API returned success=false")

                    self.backend_url = backend_url
                    return data
            except self._aiohttp.ClientError as err:
                last_network_error = err
                if index + 1 < len(self.backend_urls):
                    logger.warning(
                        "Network error calling %s API at %s: %s; trying fallback %s",
                        api_label.lower(),
                        backend_url,
                        err,
                        self.backend_urls[index + 1],
                    )
                    continue
                logger.error("Network error calling %s API: %s", api_label.lower(), err)
                raise Exception(
                    f"Failed to connect to {network_service_label} service: {err}"
                ) from err
            except Exception as err:
                logger.error("Error requesting %s: %s", request_error_label, err)
                raise

        raise Exception(
            f"Failed to connect to {network_service_label} service: {last_network_error}"
        )
