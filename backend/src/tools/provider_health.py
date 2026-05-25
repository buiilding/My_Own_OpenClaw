"""Provider-health helpers for agent capability policy."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from backend.src.core.config.models import AgentCapability, AppConfig
from backend.src.tools.web_search.capabilities import resolve_web_search_execution_mode

logger = logging.getLogger(__name__)


def _has_provider(router: Any) -> bool:
    return getattr(router, "provider", None) is not None


def _readiness_is_true(
    router: Any, attribute_name: str, *, default: bool = False
) -> bool:
    readiness = getattr(router, attribute_name, default)
    if callable(readiness):
        try:
            readiness = readiness()
        except Exception:
            logger.debug(
                "Provider readiness check %s.%s failed",
                type(router).__name__,
                attribute_name,
                exc_info=True,
            )
            return False
    return readiness is True


def _ocr_unavailable(ocr_router: Any) -> bool:
    if not _has_provider(ocr_router):
        return True
    if hasattr(ocr_router, "is_ready"):
        return not _readiness_is_true(ocr_router, "is_ready")
    return not _readiness_is_true(ocr_router, "enabled")


def _vision_unavailable(vision_router: Any) -> bool:
    if not _has_provider(vision_router):
        return True
    if getattr(vision_router, "initialization_error", None):
        return True
    return not _readiness_is_true(vision_router, "is_initialized")


def _embeddings_unavailable(config: AppConfig, embedding_router: Any) -> bool:
    if getattr(config, "memory_enabled", True) is not True:
        return True
    return not _has_provider(embedding_router)


def resolve_unavailable_agent_capabilities(
    config: AppConfig,
    *,
    ocr_router: Any = None,
    vision_router: Any = None,
    embedding_router: Any = None,
) -> list[AgentCapability]:
    """Return capabilities known unavailable before prompt construction."""
    unavailable: set[AgentCapability] = set()

    if _ocr_unavailable(ocr_router):
        unavailable.add("ocr")
    if _vision_unavailable(vision_router):
        unavailable.add("vision")
    if _embeddings_unavailable(config, embedding_router):
        unavailable.add("embeddings")
    if resolve_web_search_execution_mode(config) is None:
        unavailable.add("web_search")

    return [
        capability
        for capability in ("ocr", "vision", "embeddings", "web_search", "browser")
        if capability in unavailable
    ]


def merge_unavailable_capabilities(
    configured: Iterable[str] | None,
    resolved: Iterable[str] | None,
) -> list[str]:
    """Merge provider-health capabilities while preserving canonical order."""
    capability_set = {
        value
        for values in (configured, resolved)
        for value in (values or [])
        if isinstance(value, str)
    }
    return [
        capability
        for capability in ("ocr", "vision", "embeddings", "web_search", "browser")
        if capability in capability_set
    ]
