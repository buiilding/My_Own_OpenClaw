"""Capability helpers for web-search routing and provider-native enablement."""

from __future__ import annotations

import os
from typing import Literal, Optional

from backend.src.core.config.models import AppConfig
from backend.src.llm.models.models_config import supports_model_capability
from backend.src.tools.agent_capability_policy import disabled_capabilities_from_config

WebSearchExecutionMode = Literal["native-openai", "native-gemini", "backend-brave"]


def _normalize_provider_name(provider_name: str | None) -> str:
    if not isinstance(provider_name, str):
        return ""
    normalized = provider_name.strip().lower().replace("_", "-")
    if normalized == "google":
        return "gemini"
    return normalized


def supports_openai_native_web_search(
    provider_name: str | None,
    model_id: str | None,
) -> bool:
    if _normalize_provider_name(provider_name) != "openai":
        return False
    return supports_model_capability(
        model_id=str(model_id or ""),
        provider_name="openai",
        capability_name="supports_native_web_search",
    )


def supports_gemini_native_web_search(
    provider_name: str | None,
    model_id: str | None,
) -> bool:
    if _normalize_provider_name(provider_name) != "gemini":
        return False
    return supports_model_capability(
        model_id=str(model_id or ""),
        provider_name="gemini",
        capability_name="supports_native_web_search",
    )


def has_brave_search_api_key(cfg: AppConfig) -> bool:
    env_var = str(
        getattr(getattr(cfg, "brave_search", None), "api_key_env", "") or ""
    ).strip()
    if not env_var:
        return False
    value = os.getenv(env_var)
    return isinstance(value, str) and bool(value.strip())


def is_web_search_disabled_by_policy(cfg: AppConfig) -> bool:
    return "web_search" in disabled_capabilities_from_config(cfg)


def resolve_web_search_execution_mode(
    cfg: AppConfig,
) -> Optional[WebSearchExecutionMode]:
    if is_web_search_disabled_by_policy(cfg):
        return None

    provider_name = getattr(cfg, "model_provider", None)
    model_id = getattr(cfg, "selected_model_id", None)

    if supports_openai_native_web_search(provider_name, model_id):
        return "native-openai"
    if supports_gemini_native_web_search(provider_name, model_id):
        return "native-gemini"
    if has_brave_search_api_key(cfg):
        return "backend-brave"
    return None


def should_enable_native_web_search(cfg: AppConfig) -> bool:
    return resolve_web_search_execution_mode(cfg) in {"native-openai", "native-gemini"}


def should_enable_openai_native_web_search_main_request(cfg: AppConfig) -> bool:
    """Return whether the main OpenAI Responses request should expose native web search."""
    return resolve_web_search_execution_mode(cfg) == "native-openai"


def should_expose_backend_web_search_tool(cfg: AppConfig) -> bool:
    """Return whether the backend logical `web_search` tool should be model-visible."""
    return resolve_web_search_execution_mode(cfg) in {"native-gemini", "backend-brave"}
