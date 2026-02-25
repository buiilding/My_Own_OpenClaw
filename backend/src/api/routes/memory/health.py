"""Shared health-check helpers for memory API routes."""

from __future__ import annotations

import inspect
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


async def dependency_health_check(
    *,
    dependency: Any,
    get_dependency: Callable[[], Any] | None = None,
    missing_message: str,
    on_healthy: Callable[[Any], Awaitable[Dict[str, Any]] | Dict[str, Any]],
    logger,
    error_log_prefix: str,
    fallback_message: str = "Health check failed",
) -> Dict[str, Any]:
    """Run a dependency-aware health check with shared missing/error handling."""

    async def check() -> Dict[str, Any]:
        resolved_dependency = (
            get_dependency()
            if get_dependency is not None
            else dependency
        )
        if not resolved_dependency:
            return unhealthy_payload(missing_message)
        healthy_result = on_healthy(resolved_dependency)
        if inspect.isawaitable(healthy_result):
            return await healthy_result
        return healthy_result

    return await safe_health_check(
        check,
        logger=logger,
        error_log_prefix=error_log_prefix,
        fallback_message=fallback_message,
    )
