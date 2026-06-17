"""Provider resolution helpers for backend-owned transcription services."""

from __future__ import annotations

import os

from backend.src.core.config.models import AppConfig


def resolve_openai_api_key(config: AppConfig) -> str:
    """Resolve the OpenAI API key using the same override/env policy used elsewhere."""
    override = config.provider_api_keys.get_provider_override("openai")
    if override and override.enabled:
        user_api_key = override.api_key.strip()
        if user_api_key:
            return user_api_key

    env_name = config.llm_providers.openai.api_key_env
    return os.getenv(env_name, "").strip()
