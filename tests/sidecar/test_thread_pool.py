from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

from core import thread_pool  # noqa: E402


def test_get_executor_returns_singleton_instance():
    thread_pool.shutdown_executor(wait=True)
    try:
        first = thread_pool.get_executor(max_workers=3)
        second = thread_pool.get_executor(max_workers=20)

        assert first is second
        assert first._max_workers == 3
    finally:
        thread_pool.shutdown_executor(wait=True)


def test_shutdown_executor_resets_global_instance():
    thread_pool.shutdown_executor(wait=True)
    try:
        first = thread_pool.get_executor(max_workers=2)
        thread_pool.shutdown_executor(wait=True)
        second = thread_pool.get_executor(max_workers=4)

        assert first is not second
        assert second._max_workers == 4
    finally:
        thread_pool.shutdown_executor(wait=True)


def test_shutdown_executor_is_safe_when_not_initialized():
    thread_pool.shutdown_executor(wait=True)
    thread_pool.shutdown_executor(wait=True)
