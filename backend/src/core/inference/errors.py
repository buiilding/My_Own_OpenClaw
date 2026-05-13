"""Shared provider error types for inference capability routers."""

from __future__ import annotations

import json
from typing import Any, Optional


class ProviderCapabilityError(RuntimeError):
    """Structured error raised when an inference capability cannot serve a turn."""

    def __init__(
        self,
        *,
        capability: str,
        provider_id: str,
        code: str,
        message: str,
        retry_after_seconds: Optional[float] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.capability = capability
        self.provider_id = provider_id
        self.code = code
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        self.details = dict(details or {})
        super().__init__(self._format_message())

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": "provider_error",
            "capability": self.capability,
            "provider_id": self.provider_id,
            "code": self.code,
            "message": self.message,
        }
        if self.retry_after_seconds is not None:
            payload["retry_after_seconds"] = round(float(self.retry_after_seconds), 3)
        if self.details:
            payload["details"] = self.details
        return payload

    def _format_message(self) -> str:
        payload = json.dumps(self.to_payload(), separators=(",", ":"), sort_keys=True)
        return (
            f"{self.capability.upper()} provider error ({self.code}): "
            f"{self.message}. provider_error_json={payload}"
        )


class ProviderUnavailableError(ProviderCapabilityError):
    """Raised when a configured provider is missing, disabled, or not ready."""

    def __init__(
        self,
        *,
        capability: str,
        provider_id: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            capability=capability,
            provider_id=provider_id,
            code="provider_unavailable",
            message=message,
            details=details,
        )


class ProviderRequestError(ProviderCapabilityError):
    """Raised when a provider request fails during a turn."""

    def __init__(
        self,
        *,
        capability: str,
        provider_id: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            capability=capability,
            provider_id=provider_id,
            code="provider_request_failed",
            message=message,
            details=details,
        )


class ProviderCircuitOpenError(ProviderCapabilityError):
    """Raised when repeated provider failures have opened a circuit breaker."""

    def __init__(
        self,
        *,
        capability: str,
        provider_id: str,
        message: str,
        retry_after_seconds: Optional[float],
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(
            capability=capability,
            provider_id=provider_id,
            code="circuit_open",
            message=message,
            retry_after_seconds=retry_after_seconds,
            details=details,
        )
