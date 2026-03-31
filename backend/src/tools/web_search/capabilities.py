"""Capability helpers for logical `web_search` routing."""

from __future__ import annotations

import os
from typing import Literal, Optional

from backend.src.core.config.models import AppConfig
from backend.src.llm.models.models_config import resolve_runtime_model_id

WebSearchExecutionMode = Literal["native-openai", "native-gemini", "backend-brave"]

_OPENAI_NATIVE_MODEL_PREFIXES = ("gpt-4.1", "gpt-5")
_GEMINI_NATIVE_MODEL_PREFIXES = ("gemini-",)


def _normalize_provider_name(provider_name: str | None) -> str:
    if not isinstance(provider_name, str):
        return ""
    normalized = provider_name.strip().lower().replace("_", "-")
    if normalized == "google":
        return "gemini"
    return normalized


def _runtime_model_component(model_id: str | None) -> str:
    if not isinstance(model_id, str):
        return ""
    runtime_model_id = resolve_runtime_model_id(model_id).strip().lower()
    if "/" in runtime_model_id:
        _, runtime_model_id = runtime_model_id.split("/", 1)
    return runtime_model_id


def supports_openai_native_web_search(
    provider_name: str | None,
    model_id: str | None,
) -> bool:
    if _normalize_provider_name(provider_name) != "openai":
        return False
    runtime_model_id = _runtime_model_component(model_id)
    return runtime_model_id.startswith(_OPENAI_NATIVE_MODEL_PREFIXES)


def supports_gemini_native_web_search(
    provider_name: str | None,
    model_id: str | None,
) -> bool:
    if _normalize_provider_name(provider_name) != "gemini":
        return False
    runtime_model_id = _runtime_model_component(model_id)
    return runtime_model_id.startswith(_GEMINI_NATIVE_MODEL_PREFIXES)


def has_brave_search_api_key(cfg: AppConfig) -> bool:
    env_var = str(getattr(getattr(cfg, "brave_search", None), "api_key_env", "") or "").strip()
    if not env_var:
        return False
    value = os.getenv(env_var)
    return isinstance(value, str) and bool(value.strip())


def resolve_web_search_execution_mode(
    cfg: AppConfig,
) -> Optional[WebSearchExecutionMode]:
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


def should_expose_backend_web_search_tool(cfg: AppConfig) -> bool:
    return resolve_web_search_execution_mode(cfg) is not None
