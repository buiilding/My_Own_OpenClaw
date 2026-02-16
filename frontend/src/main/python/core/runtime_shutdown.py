"""
Shared shutdown and signal helpers for stdin-driven sidecar services.
"""

from __future__ import annotations

import logging
import signal
import sys
from types import FrameType
from typing import Any, Callable, Optional


def request_stdin_shutdown(
    service: Any,
    logger: logging.Logger,
    signum: Optional[int] = None,
) -> None:
    """Mark a service as stopping and unblock stdin read loops by closing stdin."""
    if getattr(service, "_shutdown_requested", False):
        return

    service._shutdown_requested = True
    service.running = False

    if signum is not None:
        logger.info(f"Shutdown requested via signal {signum}")

    stdin = getattr(sys, "stdin", None)
    if stdin is None or bool(getattr(stdin, "closed", False)):
        return

    close = getattr(stdin, "close", None)
    if callable(close):
        try:
            close()
        except Exception as exc:
            logger.debug(f"Failed to close stdin during shutdown request: {exc}")


def handle_shutdown_signal(
    signum: int,
    active_service: Any,
    logger: logging.Logger,
) -> bool:
    """Forward a signal to the active service when one is available."""
    logger.info(f"Received signal {signum}")
    if active_service is None:
        return False

    active_service.request_shutdown(signum)
    return True


def register_shutdown_signal_handlers(
    handler: Callable[[int, FrameType | None], None],
) -> None:
    """Register SIGINT/SIGTERM handlers for graceful shutdown."""
    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)
