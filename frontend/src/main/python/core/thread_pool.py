"""
Compatibility wrapper for legacy background thread-pool imports.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from core.executors import get_background_executor, shutdown_background_executor


def get_executor(max_workers: int = 10) -> ThreadPoolExecutor:
    """Return the shared background executor."""
    return get_background_executor(max_workers=max_workers)


def shutdown_executor(wait: bool = True) -> None:
    """Shutdown the shared background executor."""
    shutdown_background_executor(wait=wait)
