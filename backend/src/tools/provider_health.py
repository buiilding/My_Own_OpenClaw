"""Provider-health helpers for agent capability policy."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from backend.src.core.config.models import AgentCapability, AppConfig
from backend.src.tools.web_search.capabilities import resolve_web_search_execution_mode


def _has_provider(router: Any) -> bool:
    return getattr(router, "provider", None) is not None


def _ocr_unavailable(ocr_router: Any) -> bool:
    if not _has_provider(ocr_router):
        return True
    return getattr(ocr_router, "enabled", False) is not True


def _vision_unavailable(vision_router: Any) -> bool:
    if not _has_provider(vision_router):
        return True
    if getattr(vision_router, "initialization_error", None):
        return True
    return getattr(vision_router, "is_initialized", False) is not True


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
