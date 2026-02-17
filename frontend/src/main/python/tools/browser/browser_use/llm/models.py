"""Convenient access to WindieOS-supported Browser Use LLM models."""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from browser_use.llm.google.chat import ChatGoogle
from browser_use.llm.mistral.chat import ChatMistral
from browser_use.llm.openai.chat import ChatOpenAI

if TYPE_CHECKING:
    from browser_use.llm.base import BaseChatModel

openai_gpt_4o: "BaseChatModel"
openai_gpt_4o_mini: "BaseChatModel"
openai_gpt_4_1_mini: "BaseChatModel"
openai_o1: "BaseChatModel"
openai_o1_mini: "BaseChatModel"
openai_o1_pro: "BaseChatModel"
openai_o3: "BaseChatModel"
openai_o3_mini: "BaseChatModel"
openai_o3_pro: "BaseChatModel"
openai_o4_mini: "BaseChatModel"
openai_gpt_5: "BaseChatModel"
openai_gpt_5_mini: "BaseChatModel"
openai_gpt_5_nano: "BaseChatModel"

openrouter_openai_gpt_4o_mini: "BaseChatModel"
ollama_qwen3_32b: "BaseChatModel"
lmstudio_gpt_oss_20b: "BaseChatModel"
kimi_coding_kimi_k2_turbo_preview: "BaseChatModel"

google_gemini_2_0_flash: "BaseChatModel"
google_gemini_2_0_pro: "BaseChatModel"
google_gemini_2_5_pro: "BaseChatModel"
google_gemini_2_5_flash: "BaseChatModel"
google_gemini_2_5_flash_lite: "BaseChatModel"

mistral_large: "BaseChatModel"
mistral_medium: "BaseChatModel"
mistral_small: "BaseChatModel"
codestral: "BaseChatModel"
pixtral_large: "BaseChatModel"

_OPENAI_COMPAT_PROVIDERS = {
    "openai": {
        "api_key_envs": ("OPENAI_API_KEY",),
        "default_base_url": None,
    },
    "openrouter": {
        "api_key_envs": ("OPENROUTER_API_KEY", "OPENAI_API_KEY"),
        "default_base_url": "https://openrouter.ai/api/v1",
    },
    "ollama": {
        "api_key_envs": ("OLLAMA_API_KEY",),
        "default_base_url": "http://localhost:11434/v1",
    },
    "lmstudio": {
        "api_key_envs": ("LMSTUDIO_API_KEY",),
        "default_base_url": "http://localhost:1234/v1",
    },
    "kimi_coding": {
        "api_key_envs": ("KIMI_API_KEY", "KIMICODE_API_KEY"),
        "default_base_url": "https://api.kimi.com/coding",
    },
}


def _first_env(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _normalize_provider(provider: str) -> str:
    normalized = provider.strip().lower().replace("-", "_")
    if normalized == "kimi_code":
        return "kimi_coding"
    return normalized


def _normalize_model_name(model_part: str) -> str:
    replacements = {
        "gpt_4_1_mini": "gpt-4.1-mini",
        "gpt_4o_mini": "gpt-4o-mini",
        "gpt_4o": "gpt-4o",
        "gemini_2_0": "gemini-2.0",
        "gemini_2_5": "gemini-2.5",
    }
    model = model_part
    for source, target in replacements.items():
        model = model.replace(source, target)
    return model.replace("_", "-")


def _build_openai_compatible(provider: str, model: str) -> ChatOpenAI:
    provider_config = _OPENAI_COMPAT_PROVIDERS[provider]
    base_url = _first_env("OPENAI_BASE_URL")
    if provider != "openai":
        provider_env_name = f"{provider.upper()}_BASE_URL"
        base_url = _first_env(provider_env_name) or base_url
    base_url = base_url or provider_config["default_base_url"]

    api_key = _first_env(*provider_config["api_key_envs"])
    kwargs: dict[str, str] = {"model": model}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url
    return ChatOpenAI(**kwargs)


def get_llm_by_name(model_name: str):
    """Factory function to create LLM instances from string names."""
    if not model_name:
        raise ValueError("Model name cannot be empty")

    mistral_aliases = {
        "mistral_large": "mistral-large-latest",
        "mistral_medium": "mistral-medium-latest",
        "mistral_small": "mistral-small-latest",
        "codestral": "codestral-latest",
        "pixtral_large": "pixtral-large-latest",
    }
    if model_name in mistral_aliases:
        return ChatMistral(
            model=mistral_aliases[model_name],
            api_key=_first_env("MISTRAL_API_KEY"),
            base_url=_first_env("MISTRAL_BASE_URL") or "https://api.mistral.ai/v1",
        )

    parts = model_name.split("_", 1)
    if len(parts) < 2:
        raise ValueError(
            f"Invalid model name format: '{model_name}'. Expected format: 'provider_model_name'"
        )

    provider = _normalize_provider(parts[0])
    model_part = parts[1]
    model = _normalize_model_name(model_part)

    if provider in _OPENAI_COMPAT_PROVIDERS:
        return _build_openai_compatible(provider, model)

    if provider == "google":
        return ChatGoogle(model=model, api_key=_first_env("GOOGLE_API_KEY"))

    if provider == "mistral":
        mistral_map = {
            "large": "mistral-large-latest",
            "medium": "mistral-medium-latest",
            "small": "mistral-small-latest",
            "codestral": "codestral-latest",
            "pixtral-large": "pixtral-large-latest",
        }
        normalized_model_part = model_part.replace("_", "-")
        resolved_model = mistral_map.get(normalized_model_part, model)
        return ChatMistral(
            model=resolved_model,
            api_key=_first_env("MISTRAL_API_KEY"),
            base_url=_first_env("MISTRAL_BASE_URL") or "https://api.mistral.ai/v1",
        )

    available_providers = sorted(list(_OPENAI_COMPAT_PROVIDERS.keys()) + ["google", "mistral"])
    raise ValueError(
        f"Unknown provider: '{provider}'. Available providers: {', '.join(available_providers)}"
    )


def __getattr__(name: str) -> "BaseChatModel":
    if name == "ChatOpenAI":
        return ChatOpenAI  # type: ignore[return-value]
    if name == "ChatGoogle":
        return ChatGoogle  # type: ignore[return-value]
    if name == "ChatMistral":
        return ChatMistral  # type: ignore[return-value]

    try:
        return get_llm_by_name(name)
    except ValueError as exc:
        raise AttributeError(f"module '{__name__}' has no attribute '{name}'") from exc


__all__ = [
    "ChatOpenAI",
    "ChatGoogle",
    "ChatMistral",
    "get_llm_by_name",
    "openai_gpt_4o",
    "openai_gpt_4o_mini",
    "openai_gpt_4_1_mini",
    "openai_o1",
    "openai_o1_mini",
    "openai_o1_pro",
    "openai_o3",
    "openai_o3_mini",
    "openai_o3_pro",
    "openai_o4_mini",
    "openai_gpt_5",
    "openai_gpt_5_mini",
    "openai_gpt_5_nano",
    "openrouter_openai_gpt_4o_mini",
    "ollama_qwen3_32b",
    "lmstudio_gpt_oss_20b",
    "kimi_coding_kimi_k2_turbo_preview",
    "google_gemini_2_0_flash",
    "google_gemini_2_0_pro",
    "google_gemini_2_5_pro",
    "google_gemini_2_5_flash",
    "google_gemini_2_5_flash_lite",
    "mistral_large",
    "mistral_medium",
    "mistral_small",
    "codestral",
    "pixtral_large",
]
