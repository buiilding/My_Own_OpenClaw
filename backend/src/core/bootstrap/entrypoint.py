"""Shared helpers for backend executable entrypoints."""

import logging
import os

from backend.src.core.logging_setup import configure_logging


def initialize_entrypoint_logger(module_name: str) -> logging.Logger:
    """Configure logging and return a module-scoped logger."""
    configure_logging()
    return logging.getLogger(module_name)


def is_verbose_access_log() -> bool:
    """Return whether uvicorn access logging should run in verbose mode."""
    return os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"

