"""Covers websocket task manager behavior in the backend test suite."""

import asyncio
import inspect
import logging

import pytest
from tests.backend.websocket_route_test_utils import (
    install_route_deps_shim,
    restore_route_deps_shim,
)

_original_deps = install_route_deps_shim()

from backend.src.api.routes.websocket import task_manager as task_manager_module
from backend.src.api.routes.websocket.task_manager import TaskManager, TaskMetadata

restore_route_deps_shim(_original_deps)


def _only_active_task(manager: TaskManager) -> asyncio.Task:
    assert len(manager.active_tasks) == 1
    return next(iter(manager.active_tasks))


@pytest.mark.asyncio
async def test_create_task_if_under_limit_enforces_max_concurrency() -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    blocker = asyncio.Event()

    async def long_running() -> None:
        await blocker.wait()

    async def overflow_task() -> None:
        await asyncio.sleep(0)

    first_accepted = await manager.create_task_if_under_limit(long_running(), "user_1")

    assert first_accepted is True
    first_task = _only_active_task(manager)

    second_coro = overflow_task()
    second_accepted = await manager.create_task_if_under_limit(second_coro, "user_1")

    assert second_accepted is False
    assert inspect.getcoroutinestate(second_coro) == inspect.CORO_CLOSED

    blocker.set()
    await first_task
    await asyncio.sleep(0.01)
    assert len(manager.active_tasks) == 0


@pytest.mark.asyncio
async def test_create_task_if_under_limit_ignores_close_errors_on_rejected_inputs() -> (
    None
):
    manager = TaskManager(max_concurrent_tasks=0, task_cancellation_timeout=0.1)

    class BadCloseCoro:
        def close(self):
            raise RuntimeError("close failed")

    accepted = await manager.create_task_if_under_limit(
        BadCloseCoro(), "user_bad_close"
    )

    assert accepted is False


@pytest.mark.asyncio
async def test_create_task_if_under_limit_prunes_done_tasks_before_limit_check(
    monkeypatch,
) -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)
    monkeypatch.setattr(manager, "task_done_callback", lambda _task: None)

    first_accepted = await manager.create_task_if_under_limit(
        asyncio.sleep(0),
        "user_prune",
    )
    assert first_accepted is True
    first_task = _only_active_task(manager)
    await first_task

    # Completed task remains in active set when callback removal is delayed.
    assert len(manager.active_tasks) == 1

    second_accepted = await manager.create_task_if_under_limit(
        asyncio.sleep(0),
        "user_prune",
    )

    # Scheduler should prune stale done tasks before enforcing max concurrency.
    assert second_accepted is True
    second_task = _only_active_task(manager)
    await second_task


@pytest.mark.asyncio
async def test_active_task_diagnostics_reports_counts_and_context() -> None:
    manager = TaskManager(max_concurrent_tasks=2, task_cancellation_timeout=0.1)
    blocker = asyncio.Event()

    async def long_running() -> None:
        await blocker.wait()

    accepted_query = await manager.create_task_if_under_limit(
        long_running(),
        "user_diagnostics",
        metadata=TaskMetadata(
            message_type="query",
            message_id="msg-query",
            conversation_ref="conv-1",
            turn_ref="msg-query",
        ),
    )
    assert accepted_query is True

    accepted_tool_result = await manager.create_task_if_under_limit(
        long_running(),
        "user_diagnostics",
        metadata=TaskMetadata(
            message_type="tool-result",
            message_id="msg-tool",
            correlation_ref="request-1",
        ),
    )
    assert accepted_tool_result is True

    diagnostics = await manager.active_task_diagnostics()

    assert diagnostics["active_count"] == 2
    assert diagnostics["max_concurrent_tasks"] == 2
    assert diagnostics["by_type"] == {"query": 1, "tool-result": 1}
    by_id = {record["id"]: record for record in diagnostics["oldest"]}
    assert by_id["msg-query"]["type"] == "query"
    assert by_id["msg-query"]["conversation_ref"] == "conv-1"
    assert by_id["msg-query"]["turn_ref"] == "msg-query"
    assert by_id["msg-tool"]["type"] == "tool-result"
    assert by_id["msg-tool"]["correlation_ref"] == "request-1"

    blocker.set()
    await asyncio.gather(*list(manager.active_tasks))
    await asyncio.sleep(0)
    assert len(manager.active_task_metadata) == 0


@pytest.mark.asyncio
async def test_create_task_if_under_limit_closes_coro_when_task_creation_fails(
    monkeypatch,
) -> None:
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
async def test_create_task_if_under_limit_rejects_non_awaitable_input() -> None:
    manager = TaskManager(max_concurrent_tasks=1, task_cancellation_timeout=0.1)

    with pytest.raises(TypeError, match="a coroutine was expected"):
        await manager.create_task_if_under_limit(object(), "user_bad_input")

    assert len(manager.active_tasks) == 0


@pytest.mark.asyncio
async def test_cleanup_cancels_pending_tasks() -> None:
    manager = TaskManager(max_concurrent_tasks=2, task_cancellation_timeout=0.1)

    async def never_finishes() -> None:
        await asyncio.sleep(10)

    accepted = await manager.create_task_if_under_limit(never_finishes(), "user_2")
    assert accepted is True
    task = _only_active_task(manager)
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

    accepted = await manager.create_task_if_under_limit(asyncio.sleep(0), "user_done")
    assert accepted is True
    task = _only_active_task(manager)
    await task

    # Without callback removal, completed tasks remain in active set.
    assert len(manager.active_tasks) == 1

    await manager.cleanup("user_done")

    assert len(manager.active_tasks) == 0
    assert id(manager.active_tasks) == original_set_id


@pytest.mark.asyncio
async def test_task_done_callback_removes_task_without_event_loop_lookup(
    monkeypatch,
) -> None:
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

    accepted = await manager.create_task_if_under_limit(never_finishes(), "user_3")
    assert accepted is True

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

    accepted = await manager.create_task_if_under_limit(never_finishes(), "user_orphan")
    assert accepted is True

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
