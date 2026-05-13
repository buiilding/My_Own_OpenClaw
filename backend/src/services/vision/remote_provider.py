"""Remote HTTP vision provider adapter."""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import httpx

from backend.src.core.inference.errors import ProviderRequestError


class RemoteHttpVisionProvider:
    """Vision provider backed by a remote internal HTTP service."""

    provider_id = "remote-http-vision"

    def __init__(
        self,
        *,
        service_url: str,
        model_id: str,
        health_url: Optional[str] = None,
        request_timeout_seconds: float = 30.0,
        health_timeout_seconds: float = 5.0,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._service_url = service_url.rstrip("/")
        self._model_id = model_id
        self._health_url = (
            health_url.strip()
            if isinstance(health_url, str) and health_url.strip()
            else "/health"
        )
        self._request_timeout_seconds = request_timeout_seconds
        self._health_timeout_seconds = health_timeout_seconds
        self._client = http_client
        self._client_lock = asyncio.Lock()
        self._initialized = False
        self._initialization_error: Optional[str] = None

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def model_name(self) -> str:
        return self._model_id

    @property
    def is_initialized(self) -> bool:
        return self._initialized

    @property
    def initialization_error(self) -> Optional[str]:
        return self._initialization_error

    async def initialize(self) -> bool:
        await self._get_client()
        return await self.health_check()

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def health_check(self) -> bool:
        client = await self._get_client()
        try:
            response = await client.get(
                self._health_url,
                timeout=self._health_timeout_seconds,
            )
        except httpx.TimeoutException:
            self._initialized = False
            self._initialization_error = "Remote vision health check timed out"
            return False
        except httpx.HTTPError as error:
            self._initialized = False
            self._initialization_error = f"Remote vision health check failed: {error}"
            return False

        self._initialized = response.status_code < 400 and self._health_payload_ready(
            response
        )
        self._initialization_error = (
            None if self._initialized else self._extract_error_detail(response)
        )
        return self._initialized

    async def predict_coordinates(
        self,
        image_base64: str,
        description: str,
    ) -> Optional[tuple[int, int]]:
        client = await self._get_client()
        payload = {
            "image": image_base64,
            "description": description,
            "model": self._model_id,
        }
        try:
            response = await client.post(
                "/vision/locate",
                json=payload,
                timeout=self._request_timeout_seconds,
            )
        except httpx.TimeoutException as error:
            self._initialized = False
            self._initialization_error = "Remote vision service timed out"
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message="Remote vision service timed out",
            ) from error
        except httpx.HTTPError as error:
            self._initialized = False
            self._initialization_error = f"Remote vision request failed: {error}"
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=f"Remote vision service request failed: {error}",
            ) from error

        if response.status_code >= 400:
            self._initialized = response.status_code < 500
            detail = self._extract_error_detail(response)
            self._initialization_error = detail if response.status_code >= 500 else None
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=detail,
                details={"status_code": response.status_code},
            )
        self._initialized = True
        self._initialization_error = None
        return self._validate_coordinate_response(response.json())

    async def answer_question_about_image(
        self,
        image_base64: str,
        prompt: str,
    ) -> Optional[str]:
        client = await self._get_client()
        payload = {"image": image_base64, "prompt": prompt, "model": self._model_id}
        try:
            response = await client.post(
                "/vision/describe",
                json=payload,
                timeout=self._request_timeout_seconds,
            )
        except httpx.TimeoutException as error:
            self._initialized = False
            self._initialization_error = "Remote vision service timed out"
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message="Remote vision service timed out",
            ) from error
        except httpx.HTTPError as error:
            self._initialized = False
            self._initialization_error = f"Remote vision request failed: {error}"
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=f"Remote vision service request failed: {error}",
            ) from error

        if response.status_code >= 400:
            self._initialized = response.status_code < 500
            detail = self._extract_error_detail(response)
            self._initialization_error = detail if response.status_code >= 500 else None
            raise ProviderRequestError(
                capability="vision",
                provider_id=self.provider_id,
                message=detail,
                details={"status_code": response.status_code},
            )
        self._initialized = True
        self._initialization_error = None
        return self._validate_description_response(response.json())

    async def unload_model(self) -> bool:
        return False

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
        for key in ("ready", "healthy", "available", "initialized"):
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
        return f"Remote vision service returned {response.status_code}"

    @staticmethod
    def _validate_coordinate_response(body: Any) -> tuple[int, int]:
        point = RemoteHttpVisionProvider._extract_point(body)
        if point is None:
            raise ProviderRequestError(
                capability="vision",
                provider_id=RemoteHttpVisionProvider.provider_id,
                message="Remote vision service returned no coordinates",
            )
        return point

    @staticmethod
    def _extract_point(body: Any) -> Optional[tuple[int, int]]:
        if not isinstance(body, dict):
            return None
        for key in ("point", "center", "coordinates"):
            value = body.get(key)
            point = RemoteHttpVisionProvider._coerce_point(value)
            if point is not None:
                return point
        match = body.get("match")
        if isinstance(match, dict):
            for key in ("point", "center", "coordinates"):
                point = RemoteHttpVisionProvider._coerce_point(match.get(key))
                if point is not None:
                    return point
        return RemoteHttpVisionProvider._coerce_point(body)

    @staticmethod
    def _coerce_point(value: Any) -> Optional[tuple[int, int]]:
        if isinstance(value, dict):
            if "x" in value and "y" in value:
                try:
                    return int(value["x"]), int(value["y"])
                except (TypeError, ValueError):
                    return None
        if isinstance(value, (list, tuple)) and len(value) >= 2:
            try:
                return int(value[0]), int(value[1])
            except (TypeError, ValueError):
                return None
        return None

    @staticmethod
    def _validate_description_response(body: Any) -> str:
        if isinstance(body, str) and body.strip():
            return body.strip()
        if isinstance(body, dict):
            for key in ("answer", "description", "text", "result"):
                value = body.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        raise ProviderRequestError(
            capability="vision",
            provider_id=RemoteHttpVisionProvider.provider_id,
            message="Remote vision service returned no description",
        )
