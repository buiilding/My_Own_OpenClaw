import sys
from pathlib import Path

frontend_python_dir = Path(__file__).resolve().parents[2] / "frontend" / "src" / "main" / "python"
sys.path.insert(0, str(frontend_python_dir))

from core import thread_pool as thread_pool_module  # noqa: E402


def setup_function():
    thread_pool_module.shutdown_executor(wait=True)


def teardown_function():
    thread_pool_module.shutdown_executor(wait=True)


def test_get_executor_reuses_existing_executor_instance():
    first = thread_pool_module.get_executor(max_workers=2)
    second = thread_pool_module.get_executor(max_workers=8)

    assert first is second
    assert first._max_workers == 2


def test_shutdown_executor_calls_shutdown_with_wait_and_resets(monkeypatch):
    calls = []

    class DummyExecutor:
        def shutdown(self, wait=True):
            calls.append(wait)

    monkeypatch.setattr(thread_pool_module, "_executor", DummyExecutor())

    thread_pool_module.shutdown_executor(wait=False)

    assert calls == [False]
    assert thread_pool_module._executor is None


def test_shutdown_executor_is_noop_when_uninitialized():
    thread_pool_module._executor = None

    thread_pool_module.shutdown_executor(wait=True)

    assert thread_pool_module._executor is None


def test_get_executor_creates_new_instance_after_shutdown():
    first = thread_pool_module.get_executor(max_workers=1)

    thread_pool_module.shutdown_executor(wait=True)

    second = thread_pool_module.get_executor(max_workers=3)

    assert first is not second
    assert second._max_workers == 3
