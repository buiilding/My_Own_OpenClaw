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
async def test_create_task_if_under_limit_ignores_close_errors_on_rejected_inputs() -> None:
    manager = TaskManager(max_concurrent_tasks=0, task_cancellation_timeout=0.1)

    class BadCloseCoro:
        def close(self):
            raise RuntimeError("close failed")

    task, limit_exceeded = await manager.create_task_if_under_limit(
        BadCloseCoro(), "user_bad_close"
    )

    assert task is None
    assert limit_exceeded is True


@pytest.mark.asyncio
async def test_create_task_if_under_limit_prunes_done_tasks_before_limit_check(
    monkeypatch,
) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    monkeypatch.setattr(manager, "task_done_callback", lambda _task: None)

    first_task, first_limit_exceeded = await manager.create_task_if_under_limit(
        asyncio.sleep(0),
        "user_prune",
    )
    assert first_task is not None
    assert first_limit_exceeded is False
    await first_task

    # Completed task remains in active set when callback removal is delayed.
    assert len(manager.active_tasks) == 1

    second_task, second_limit_exceeded = await manager.create_task_if_under_limit(
        asyncio.sleep(0),
        "user_prune",
    )

    # Scheduler should prune stale done tasks before enforcing max concurrency.
    assert second_task is not None
    assert second_limit_exceeded is False
    await second_task


@pytest.mark.asyncio
async def test_create_task_if_under_limit_closes_coro_when_task_creation_fails(monkeypatch) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)

    async def some_coro() -> None:
        await asyncio.sleep(0)

    coro = some_coro()

    def fail_create_task(_coro):
        raise RuntimeError("loop closed")

    monkeypatch.setattr(asyncio, "create_task", fail_create_task)

    with pytest.raises(RuntimeError, match="loop closed"):
        await manager.create_task_if_under_limit(coro, "user_create_fail")

    assert inspect.getcoroutinestate(coro) == inspect.CORO_CLOSED


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
    original_set_id = id(manager.active_tasks)

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
    assert id(manager.active_tasks) == original_set_id


@pytest.mark.asyncio
async def test_task_done_callback_removes_task_without_event_loop_lookup(monkeypatch) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    task = asyncio.create_task(asyncio.sleep(0))
    manager.active_tasks.add(task)

    def fail_if_called():
        raise AssertionError("get_running_loop should not be called")

    monkeypatch.setattr(asyncio, "get_running_loop", fail_if_called)

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


@pytest.mark.asyncio
async def test_cleanup_logs_orphaned_tasks_when_cancellation_not_observed(
    caplog,
    monkeypatch,
) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.01)
    caplog.set_level(logging.ERROR)

    async def never_finishes() -> None:
        await asyncio.sleep(10)

    async def skip_wait_for(_awaitable, timeout):  # noqa: ARG001
        return None

    monkeypatch.setattr(task_manager_module.asyncio, "wait_for", skip_wait_for)

    task, limit_exceeded = await manager.create_task_if_under_limit(
        never_finishes(), "user_orphan"
    )
    assert task is not None
    assert limit_exceeded is False

    await manager.cleanup("user_orphan")

    assert "Orphaned 1 tasks after cleanup for user user_orphan" in caplog.text
    await asyncio.sleep(0)


def test_task_done_callback_swallows_runtime_error_from_set_discard() -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)

    class ExplodingSet:
        def discard(self, _task):
            raise RuntimeError("set iterating")

    manager.active_tasks = ExplodingSet()  # type: ignore[assignment]
    manager.task_done_callback(object())  # type: ignore[arg-type]
