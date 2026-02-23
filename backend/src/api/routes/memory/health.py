"""Shared health-check helpers for memory API routes."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict


def healthy_payload(**fields: Any) -> Dict[str, Any]:
    """Return the canonical healthy response payload."""
    return {
        "status": "healthy",
        **fields,
    }


def unhealthy_payload(message: str) -> Dict[str, Any]:
    """Return the canonical unhealthy response payload."""
    return {
        "status": "unhealthy",
        "message": message,
    }


async def safe_health_check(
    check_fn: Callable[[], Awaitable[Dict[str, Any]]],
    *,
    logger,
    error_log_prefix: str,
    fallback_message: str = "Health check failed",
) -> Dict[str, Any]:
    """Run a health check and normalize unexpected exceptions."""
    try:
        return await check_fn()
    except Exception as error:  # pragma: no cover - route tests cover behavior
        logger.error("%s: %s", error_log_prefix, error, exc_info=True)
        return unhealthy_payload(fallback_message)
