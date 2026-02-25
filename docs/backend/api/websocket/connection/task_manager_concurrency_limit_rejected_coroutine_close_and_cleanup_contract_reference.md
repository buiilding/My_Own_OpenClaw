---
summary: "Deep reference for websocket TaskManager internals: done-task pruning, concurrency limit enforcement, rejected coroutine close behavior, and cancellation/zombie cleanup guarantees."
read_when:
  - When changing `TaskManager.create_task_if_under_limit`, `task_done_callback`, or `cleanup`.
  - When debugging task-limit rejections, `coroutine was never awaited` warnings, or disconnect cleanup leaks.
title: "Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference"
---

# Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference

## Canonical Modules

- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/routes/websocket/__init__.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_websocket_route.py`

## Ownership and Scope

Each websocket connection creates one `TaskManager` configured from app config:

- `max_concurrent_tasks`
- `task_cancellation_timeout`

It tracks route-dispatch tasks only (`active_tasks` set), not arbitrary sub-tasks spawned by handlers.

## Scheduling Contract

`create_task_if_under_limit(coro, user_id)` sequence under `tasks_lock`:

1. prune completed tasks (`_prune_done_tasks_locked`)
2. if active count already at limit:
   - close coroutine input via `_close_if_coroutine`
   - return `(None, True)`
3. else create task (`asyncio.create_task(coro)`)
4. add task to set and register `task_done_callback`
5. return `(task, False)`

Atomicity:

- limit check + task creation/set insert happen within same lock scope.

## Rejected-Coroutine Close Guarantee

`_close_if_coroutine(...)` calls `.close()` when available and swallows close failures.

Purpose:

- avoid `RuntimeWarning: coroutine was never awaited` when scheduling is rejected or create_task fails.

Also applied when `asyncio.create_task(...)` itself raises: coroutine is closed before re-raise.

## Callback and Pruning Behavior

`task_done_callback(task)`:

- discards task in-place from `active_tasks`
- swallows `RuntimeError` set-edge cases during shutdown

`_prune_done_tasks_locked()`:

- deterministic secondary cleanup path
- ensures done-task removal even if callback cleanup is delayed/missed

## Cleanup Contract

`cleanup(user_id)` behavior:

1. snapshot pending tasks under lock (`not task.done()`)
2. cancel all pending tasks
3. await cancellation reaction with:
   - `asyncio.gather(..., return_exceptions=True)`
   - wrapped in `asyncio.wait_for(..., timeout=task_cancellation_timeout)`
4. log warning on timeout
5. log error if zombie tasks remain not done
6. final prune under lock

Result:

- best-effort bounded shutdown and explicit diagnostics for orphan tasks.

## Route Integration Contract

`websocket_endpoint` uses manager return tuple:

- `(task, False)` -> continue loop
- `(None, True)` -> send client error `"Too many concurrent requests. Please wait."`

`finally` block always calls `cleanup_connection(...)`, which invokes:

- `task_manager.cleanup(user_id)`
- then session teardown

## Test-Backed Matrix

`tests/backend/test_websocket_task_manager.py` verifies:

- hard max concurrency rejection
- rejected coroutine is closed
- close failures on rejected non-coroutine-like objects are swallowed
- done-task pruning before limit check allows immediate reschedule
- create_task failure closes coroutine then re-raises
- cleanup cancels pending tasks
- cleanup prunes done tasks even when callback removal is disabled
- callback path does not depend on event-loop lookup and swallows discard runtime errors
- timeout and orphan-task log paths emit expected warnings/errors

`tests/backend/test_websocket_route.py` verifies timeout path still performs one cleanup call.

## Drift Hotspots

1. Removing coroutine-close path reintroduces un-awaited coroutine leaks on limit rejection.
2. Removing pre-limit prune can falsely reject new work while only done tasks remain.
3. Skipping bounded wait in cleanup can hang disconnect flow under non-cooperative handlers.
4. Downgrading zombie-task error logging hides hard cleanup failures.

## Related Pages

- [Backend API WebSocket Connection Docs Hub](README.md)
- [Handshake Parse, Validation, and Policy-Close Contract Reference](handshake_parse_validation_and_policy_close_contract_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](../../websocket_connection_and_task_lifecycle_reference.md)
