"""Covers local-runtime executor behavior."""

from tests.sidecar.remote_client_test_utils import ensure_frontend_python_path

ensure_frontend_python_path()

import core.executors as executors  # noqa: E402

import pytest


def test_executor_module_doc_uses_local_runtime_wording():
    assert "local-runtime blocking workloads" in (executors.__doc__ or "")
    assert "sidecar blocking workloads" not in (executors.__doc__ or "")


@pytest.fixture(autouse=True)
def reset_executors():
    executors.shutdown_all_executors(wait=True)
    try:
        yield
    finally:
        executors.shutdown_all_executors(wait=True)


def test_interactive_executor_is_singleton():
    first = executors.get_interactive_executor(max_workers=2)
    second = executors.get_interactive_executor(max_workers=8)

    assert first is second
    assert first._max_workers == 2


def test_background_executor_is_singleton():
    first = executors.get_background_executor(max_workers=1)
    second = executors.get_background_executor(max_workers=6)

    assert first is second
    assert first._max_workers == 1


def test_background_shutdown_does_not_reset_interactive():
    interactive = executors.get_interactive_executor(max_workers=3)
    background = executors.get_background_executor(max_workers=2)

    executors.shutdown_background_executor(wait=True)

    replacement_background = executors.get_background_executor(max_workers=4)
    same_interactive = executors.get_interactive_executor(max_workers=9)

    assert replacement_background is not background
    assert replacement_background._max_workers == 4
    assert same_interactive is interactive
    assert same_interactive._max_workers == 3


def test_configure_event_loop_default_executor_uses_interactive(monkeypatch):
    sentinel = object()
    seen: dict[str, object] = {}

    class FakeLoop:
        def set_default_executor(self, executor):
            seen["executor"] = executor

    monkeypatch.setattr(
        executors,
        "get_interactive_executor",
        lambda max_workers=None: sentinel,
    )

    executors.configure_event_loop_default_executor(FakeLoop())

    assert seen["executor"] is sentinel


def test_interactive_executor_uses_env_override(monkeypatch):
    monkeypatch.setenv(executors.ENV_WINDIE_INTERACTIVE_WORKERS, "5")

    interactive = executors.get_interactive_executor()

    assert interactive._max_workers == 5


def test_interactive_executor_prefers_agent_env_override(monkeypatch):
    monkeypatch.setenv(executors.ENV_WINDIE_INTERACTIVE_WORKERS, "5")
    monkeypatch.setenv(executors.ENV_AGENT_INTERACTIVE_WORKERS, "3")

    interactive = executors.get_interactive_executor()

    assert interactive._max_workers == 3


def test_background_executor_supports_agent_env_override(monkeypatch):
    monkeypatch.setenv(executors.ENV_WINDIE_BACKGROUND_WORKERS, "2")
    monkeypatch.setenv(executors.ENV_AGENT_BACKGROUND_WORKERS, "6")

    background = executors.get_background_executor()

    assert background._max_workers == 6
