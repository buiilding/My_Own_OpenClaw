"""Shared helpers for backend executable entrypoints."""

import logging
import os
from typing import Iterable

from backend.src.core.logging_setup import configure_logging


def initialize_entrypoint_logger(module_name: str) -> logging.Logger:
    """Configure logging and return a module-scoped logger."""
    configure_logging()
    return logging.getLogger(module_name)


def is_verbose_access_log() -> bool:
    """Return whether uvicorn access logging should run in verbose mode."""
    return os.getenv("WINDIEOS_LOG_PROFILE", "important").lower() == "verbose"


def run_uvicorn_app(
    app_path: str,
    *,
    host: str = "0.0.0.0",
    port: int = 8765,
    reload: bool = False,
    reload_dirs: Iterable[str] | None = None,
) -> None:
    """Run a uvicorn app target with shared access-log profile handling."""
    import uvicorn

    run_kwargs = {
        "host": host,
        "port": port,
        "access_log": is_verbose_access_log(),
        "reload": reload,
    }
    if reload_dirs is not None:
        run_kwargs["reload_dirs"] = list(reload_dirs)

    uvicorn.run(app_path, **run_kwargs)
