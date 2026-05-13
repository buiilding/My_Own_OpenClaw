"""Remote HTTP OCR provider adapter."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

from backend.src.core.inference.errors import ProviderRequestError


class RemoteHttpOcrProvider:
    """OCR provider backed by a remote internal HTTP service."""

    provider_id = "remote-http-ocr"

    def __init__(
        self,
        *,
        service_url: str,
        model_id: str,
        health_url: Optional[str] = None,
        request_timeout_seconds: float = 10.0,
        health_timeout_seconds: float = 3.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self.model_id = model_id
        self._health_url = (
            health_url.strip()
            if isinstance(health_url, str) and health_url.strip()
            else "/health"
        )
        self._request_timeout_seconds = request_timeout_seconds
        self._health_timeout_seconds = health_timeout_seconds
        self._client = http_client
        self._client_lock = asyncio.Lock()
        self._enabled = True
        self._ready = False
        self._last_health_error: Optional[str] = None

    @property
    def enabled(self) -> bool:
        return self._enabled and self._ready

    @enabled.setter
    def enabled(self, value: bool) -> None:
        self._enabled = bool(value)

    @property
    def is_ready(self) -> bool:
        return self.enabled

    @property
    def last_health_error(self) -> Optional[str]:
        return self._last_health_error

    async def initialize(self) -> None:
        await self._get_client()
        await self.health_check()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def health_check(self) -> bool:
        if not self._enabled:
            self._ready = False
            self._last_health_error = "OCR provider disabled"
            return False
        client = await self._get_client()
        try:
            response = await client.get(
                self._health_url,
                timeout=self._health_timeout_seconds,
            )
        except httpx.TimeoutException:
            self._ready = False
            self._last_health_error = "Remote OCR health check timed out"
            return False
        except httpx.HTTPError as error:
            self._ready = False
            self._last_health_error = f"Remote OCR health check failed: {error}"
            return False
        self._ready = response.status_code < 400 and self._health_payload_ready(
            response
        )
        self._last_health_error = (
            None if self._ready else self._extract_error_detail(response)
        )
        return self._ready

    async def analyze_image(self, image_base64: str) -> Optional[list[dict[str, Any]]]:
        if not self._enabled:
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message="Remote OCR provider is disabled",
            )
        client = await self._get_client()
        payload = {"image": image_base64, "model": self.model_id}
        try:
            response = await client.post(
                "/ocr/analyze",
                json=payload,
                timeout=self._request_timeout_seconds,
            )
        except httpx.TimeoutException as error:
            self._ready = False
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message="Remote OCR service timed out",
            ) from error
        except httpx.HTTPError as error:
            self._ready = False
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message=f"Remote OCR service request failed: {error}",
            ) from error

        if response.status_code >= 400:
            self._ready = response.status_code < 500
            raise ProviderRequestError(
                capability="ocr",
                provider_id=self.provider_id,
                message=self._extract_error_detail(response),
                details={"status_code": response.status_code},
            )
        self._ready = True
        return self._validate_response_body(response.json())

    async def perform_ocr(self, screenshot_b64: str) -> Optional[list[dict[str, Any]]]:
        return await self.analyze_image(screenshot_b64)

    async def _get_client(self) -> httpx.AsyncClient:
        async with self._client_lock:
            if self._client is None:
                self._client = httpx.AsyncClient(
                    base_url=self._service_url,
                    timeout=self._request_timeout_seconds,
                )
            return self._client

    @staticmethod
    def _health_payload_ready(response: httpx.Response) -> bool:
        try:
            body = response.json()
        except Exception:
            return True
        if not isinstance(body, dict):
            return True
        for key in ("ready", "healthy", "available"):
            value = body.get(key)
            if isinstance(value, bool):
                return value
        status = body.get("status")
        if isinstance(status, str):
            return status.lower() in {"ok", "healthy", "ready", "available"}
        return True

    @staticmethod
    def _extract_error_detail(response: httpx.Response) -> str:
        try:
            body = response.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            detail = body.get("detail") or body.get("message") or body.get("error")
            if isinstance(detail, str) and detail.strip():
                return detail.strip()
        text = response.text.strip()
        if text:
            return text
        return f"Remote OCR service returned {response.status_code}"

    @staticmethod
    def _validate_response_body(body: Any) -> list[dict[str, Any]]:
        if isinstance(body, list):
            results = body
        elif isinstance(body, dict):
            results = (
                body.get("results")
                or body.get("ocr_results")
                or body.get("items")
                or body.get("data")
            )
        else:
            results = None
        if not isinstance(results, list):
            raise ProviderRequestError(
                capability="ocr",
                provider_id=RemoteHttpOcrProvider.provider_id,
                message="Remote OCR service returned a payload without results",
            )
        return [item for item in results if isinstance(item, dict)]
