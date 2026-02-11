"""
Runtime configuration policy helpers.

Centralizes post-load config policies so loader/manager/service paths stay
consistent when building runtime AppConfig instances.
"""

from __future__ import annotations

from typing import Callable

from backend.src.core.config.models import AppConfig


def apply_runtime_policies(
    cfg: AppConfig,
    *,
    get_default_tts_model_path: Callable[[], str],
    force_tts_enabled: bool = True,
) -> AppConfig:
    """
    Apply runtime config normalization policies.

    Policies:
    - Force `tts_enabled=True` (current backend behavior).
    - Ensure `tts_model_path` is set when TTS is enabled.
    """
    updated = cfg

    if force_tts_enabled and not updated.tts_enabled:
        updated = updated.model_copy(update={"tts_enabled": True})

    if updated.tts_enabled and not updated.tts_model_path:
        updated = updated.model_copy(
            update={"tts_model_path": get_default_tts_model_path()}
        )

    return updated


def assemble_runtime_config(
    cfg: AppConfig,
    *,
    get_default_tts_model_path: Callable[[], str],
    load_api_key_for_provider: Callable[[AppConfig], AppConfig],
    force_tts_enabled: bool = True,
) -> AppConfig:
    """
    Apply runtime normalization + provider key loading in one step.
    """
    normalized = apply_runtime_policies(
        cfg,
        get_default_tts_model_path=get_default_tts_model_path,
        force_tts_enabled=force_tts_enabled,
    )
    return load_api_key_for_provider(normalized)
