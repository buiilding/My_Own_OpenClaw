"""Covers local-runtime thread pool behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import executors  # noqa: E402


def test_get_background_executor_returns_singleton_instance():
    executors.shutdown_background_executor(wait=True)
    try:
        first = executors.get_background_executor(max_workers=3)
        second = executors.get_background_executor(max_workers=20)

        assert first is second
        assert first._max_workers == 3
    finally:
        executors.shutdown_background_executor(wait=True)


def test_shutdown_background_executor_resets_global_instance():
    executors.shutdown_background_executor(wait=True)
    try:
        first = executors.get_background_executor(max_workers=2)
        executors.shutdown_background_executor(wait=True)
        second = executors.get_background_executor(max_workers=4)

        assert first is not second
        assert second._max_workers == 4
    finally:
        executors.shutdown_background_executor(wait=True)


def test_shutdown_background_executor_is_safe_when_not_initialized():
    executors.shutdown_background_executor(wait=True)
    executors.shutdown_background_executor(wait=True)
