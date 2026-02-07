import asyncio
import inspect
import logging
import sys
import types

import pytest

# Test-only shim: avoid pulling full app container deps during route import.
_original_deps = sys.modules.get("backend.src.api.deps")
fake_deps = types.ModuleType("backend.src.api.deps")
fake_deps.ContainerDep = object
fake_deps.SessionManagerDep = object
fake_deps.HandlerRegistryDep = object
sys.modules["backend.src.api.deps"] = fake_deps

from backend.src.api.routes.websocket import task_manager as task_manager_module
from backend.src.api.routes.websocket.task_manager import TaskManager

if _original_deps is not None:
    sys.modules["backend.src.api.deps"] = _original_deps
else:
    sys.modules.pop("backend.src.api.deps", None)


@pytest.mark.asyncio
async def test_create_task_if_under_limit_enforces_max_concurrency() -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    blocker = asyncio.Event()

    async def long_running() -> None:
        await blocker.wait()

    async def overflow_task() -> None:
        await asyncio.sleep(0)

    first_task, first_limit_exceeded = await manager.create_task_if_under_limit(
        long_running(), "user_1"
    )

    assert first_task is not None
    assert first_limit_exceeded is False

    second_coro = overflow_task()
    second_task, second_limit_exceeded = await manager.create_task_if_under_limit(
        second_coro, "user_1"
    )

    assert second_task is None
    assert second_limit_exceeded is True
    assert inspect.getcoroutinestate(second_coro) == inspect.CORO_CLOSED

    blocker.set()
    await first_task
    await asyncio.sleep(0.01)
    assert len(manager.active_tasks) == 0


@pytest.mark.asyncio
async def test_cleanup_cancels_pending_tasks() -> None:
    manager = TaskManager(max_concurrent_tasks=2, task_cancellation_timeout=0.1)

    async def never_finishes() -> None:
        await asyncio.sleep(10)

    task, limit_exceeded = await manager.create_task_if_under_limit(
        never_finishes(), "user_2"
    )
    assert task is not None
    assert limit_exceeded is False
    assert len(manager.active_tasks) == 1

    await manager.cleanup("user_2")

    assert task.done()
    assert task.cancelled()


@pytest.mark.asyncio
async def test_cleanup_prunes_completed_tasks_when_callback_cleanup_is_delayed(
    monkeypatch,
) -> None:
    manager = TaskManager(max_concurrent_tasks=2, task_cancellation_timeout=0.1)
    monkeypatch.setattr(manager, "task_done_callback", lambda _task: None)

    task, limit_exceeded = await manager.create_task_if_under_limit(
        asyncio.sleep(0), "user_done"
    )
    assert task is not None
    assert limit_exceeded is False
    await task

    # Without callback removal, completed tasks remain in active set.
    assert len(manager.active_tasks) == 1

    await manager.cleanup("user_done")

    assert len(manager.active_tasks) == 0


@pytest.mark.asyncio
async def test_task_done_callback_falls_back_when_loop_unavailable(monkeypatch) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    task = asyncio.create_task(asyncio.sleep(0))
    manager.active_tasks.add(task)

    def raise_runtime_error():
        raise RuntimeError("no running event loop")

    monkeypatch.setattr(asyncio, "get_running_loop", raise_runtime_error)

    manager.task_done_callback(task)
    await task

    assert task not in manager.active_tasks


@pytest.mark.asyncio
async def test_cleanup_logs_timeout(caplog, monkeypatch) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.01)
    caplog.set_level(logging.WARNING)
    monkeypatch.setattr(
        manager,
        "task_done_callback",
        lambda task: manager.active_tasks.discard(task),
    )

    async def never_finishes() -> None:
        await asyncio.sleep(10)

    async def forced_timeout(awaitable, timeout):  # noqa: ARG001
        awaitable.cancel()
        raise asyncio.TimeoutError()

    monkeypatch.setattr(task_manager_module.asyncio, "wait_for", forced_timeout)

    task, limit_exceeded = await manager.create_task_if_under_limit(never_finishes(), "user_3")
    assert task is not None
    assert limit_exceeded is False

    await manager.cleanup("user_3")

    assert "Timeout waiting for" in caplog.text
    await asyncio.sleep(0)
