"""Embedding provider error contracts."""

from __future__ import annotations


class EmbeddingCapacityExceededError(Exception):
    """Raised when embedding capacity cannot accept another request in time."""

    def __init__(self, message: str = "Embedding service is saturated") -> None:
        super().__init__(message)
        self.status_code = 503
        self.detail = message


class EmbeddingProviderRequestError(Exception):
    """Raised when a provider request fails with a normalized HTTP-facing status."""

    def __init__(self, *, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
