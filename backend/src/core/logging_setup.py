"""
Logging setup for backend services.

Profiles:
- important (default): keep high-signal INFO + warnings/errors
  Set WINDIEOS_LOG_PROFILE=verbose for full logs.
"""

from __future__ import annotations

import logging
import os
from typing import Dict

_DEFAULT_FORMAT = "%(name)s - %(levelname)s - %(message)s"

_NOISY_LIB_LOGGERS: Dict[str, int] = {
    "litellm": logging.WARNING,
    "LiteLLM": logging.WARNING,
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "urllib3": logging.WARNING,
    "aiosqlite": logging.WARNING,
    "PIL": logging.WARNING,
    "PIL.PngImagePlugin": logging.WARNING,
    "Pillow": logging.WARNING,
    "transformers": logging.WARNING,
    "transformers_modules": logging.WARNING,
    "accelerate": logging.WARNING,
    "sentence_transformers": logging.WARNING,
    "RapidOCR": logging.WARNING,
}

_IMPORTANT_PROFILE_LOGGERS: Dict[str, int] = {
    # Drop per-request access logs
    "uvicorn.access": logging.WARNING,
    # Config/memory noise
    "backend.src.core.config": logging.WARNING,
    "backend.src.tools.registry": logging.WARNING,
    "backend.src.api.infrastructure.registry": logging.WARNING,
    "backend.src.api.deps": logging.WARNING,
    "backend.src.core.infrastructure.bus": logging.WARNING,
    "backend.src.core.config.subscriptions": logging.WARNING,
    "backend.src.core.container.session_factory": logging.WARNING,
    # Agent internals + parser chatter
    "backend.src.agent.session.session": logging.WARNING,
    "backend.src.agent.llm": logging.WARNING,
    "backend.src.agent.tools": logging.WARNING,
    "backend.src.llm.parser": logging.WARNING,
    "backend.src.llm.parser_extraction": logging.WARNING,
    "backend.src.llm.models.model_service": logging.WARNING,
    # Simulation + embeddings noise
    "backend.src.simulation.mock_llm_client": logging.WARNING,
    "backend.src.api.routes.memory.embeddings": logging.WARNING,
    # OCR/Vision progress
    "backend.src.services.ocr": logging.WARNING,
    "backend.src.services.vision": logging.WARNING,
    "backend.src.services.vision.providers.internvl": logging.WARNING,
}


def _set_levels(levels: Dict[str, int]) -> None:
    for name, level in levels.items():
        logging.getLogger(name).setLevel(level)


def _resolve_level(default_level: int) -> int:
    env_level = os.getenv("LOG_LEVEL")
    if not env_level:
        return default_level
    return logging._nameToLevel.get(env_level.upper(), default_level)


def configure_logging(profile: str | None = None) -> None:
    """
    Configure logging levels and noise filters.

    Args:
        profile: "important" (default) or "verbose". Can also set via
            WINDIEOS_LOG_PROFILE environment variable.
    """
    resolved_profile = (profile or os.getenv("WINDIEOS_LOG_PROFILE", "important")).lower()

    if resolved_profile == "verbose":
        level = _resolve_level(logging.DEBUG)
    else:
        level = _resolve_level(logging.INFO)

    logging.basicConfig(level=level, format=_DEFAULT_FORMAT)

    # Reduce library noise in all profiles
    _set_levels(_NOISY_LIB_LOGGERS)

    # Prevent prompt content logs
    logging.getLogger("backend.src.llm.prompts.prompt_constructor").setLevel(logging.INFO)

    if resolved_profile == "important":
        _set_levels(_IMPORTANT_PROFILE_LOGGERS)
