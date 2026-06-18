"""
Bounded executor management for sidecar blocking workloads.

Two pools are maintained:
- interactive: latency-sensitive tool/system-state offloads
- background: memory/index persistence and maintenance jobs
"""

from __future__ import annotations

import logging
import os
import platform
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Optional

logger = logging.getLogger(__name__)

ENV_AGENT_INTERACTIVE_WORKERS = "AGENT_INTERACTIVE_WORKERS"
ENV_AGENT_BACKGROUND_WORKERS = "AGENT_BACKGROUND_WORKERS"
ENV_INTERACTIVE_WORKERS = "WINDIE_INTERACTIVE_WORKERS"
ENV_BACKGROUND_WORKERS = "WINDIE_BACKGROUND_WORKERS"

_interactive_executor: Optional[ThreadPoolExecutor] = None
_background_executor: Optional[ThreadPoolExecutor] = None
_executor_lock = Lock()


def _default_interactive_workers() -> int:
    system_name = platform.system()
    if system_name == "Darwin":
        return 3
    if system_name == "Windows":
        return 4
    return 4


def _default_background_workers() -> int:
    system_name = platform.system()
    if system_name == "Darwin":
        return 1
    return 2


def _parse_worker_override(raw_value: Optional[str], default: int) -> int:
    if raw_value is None:
        return default
    try:
        parsed = int(raw_value.strip())
    except (TypeError, ValueError):
        logger.warning("Invalid executor worker override '%s'; using %s", raw_value, default)
        return default
    if parsed < 1:
        logger.warning("Executor worker override must be >= 1 (got %s); using %s", parsed, default)
        return default
    return parsed


def _read_first_env(names: tuple[str, ...]) -> Optional[str]:
    for name in names:
        raw_value = os.getenv(name)
        if raw_value is not None:
            return raw_value
    return None


def _resolve_interactive_workers(max_workers: Optional[int]) -> int:
    if isinstance(max_workers, int) and max_workers > 0:
        return max_workers
    return _parse_worker_override(
        _read_first_env((ENV_AGENT_INTERACTIVE_WORKERS, ENV_INTERACTIVE_WORKERS)),
        _default_interactive_workers(),
    )


def _resolve_background_workers(max_workers: Optional[int]) -> int:
    if isinstance(max_workers, int) and max_workers > 0:
        return max_workers
    return _parse_worker_override(
        _read_first_env((ENV_AGENT_BACKGROUND_WORKERS, ENV_BACKGROUND_WORKERS)),
        _default_background_workers(),
    )


def get_interactive_executor(max_workers: Optional[int] = None) -> ThreadPoolExecutor:
    """Return the singleton interactive executor."""
    global _interactive_executor
    with _executor_lock:
        if _interactive_executor is None:
            worker_count = _resolve_interactive_workers(max_workers)
            logger.info("Initializing interactive executor with %s workers", worker_count)
            _interactive_executor = ThreadPoolExecutor(
                max_workers=worker_count,
                thread_name_prefix="InteractiveWorker",
            )
        return _interactive_executor


def get_background_executor(max_workers: Optional[int] = None) -> ThreadPoolExecutor:
    """Return the singleton background executor."""
    global _background_executor
    with _executor_lock:
        if _background_executor is None:
            worker_count = _resolve_background_workers(max_workers)
            logger.info("Initializing background executor with %s workers", worker_count)
            _background_executor = ThreadPoolExecutor(
                max_workers=worker_count,
                thread_name_prefix="BackgroundWorker",
            )
        return _background_executor


def configure_event_loop_default_executor(loop) -> None:
    """Bind loop default executor to the bounded interactive pool."""
    loop.set_default_executor(get_interactive_executor())


def shutdown_interactive_executor(wait: bool = True) -> None:
    """Shutdown the interactive executor singleton."""
    global _interactive_executor
    with _executor_lock:
        if _interactive_executor is not None:
            logger.info("Shutting down interactive executor")
            _interactive_executor.shutdown(wait=wait)
            _interactive_executor = None


def shutdown_background_executor(wait: bool = True) -> None:
    """Shutdown the background executor singleton."""
    global _background_executor
    with _executor_lock:
        if _background_executor is not None:
            logger.info("Shutting down background executor")
            _background_executor.shutdown(wait=wait)
            _background_executor = None


def shutdown_all_executors(wait: bool = True) -> None:
    """Shutdown both executor pools."""
    shutdown_interactive_executor(wait=wait)
    shutdown_background_executor(wait=wait)
