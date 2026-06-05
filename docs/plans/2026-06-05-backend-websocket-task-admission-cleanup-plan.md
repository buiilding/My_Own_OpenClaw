---
summary: "Execution plan for deletion-first cleanup of backend websocket task admission so scheduling has one deterministic admission path."
read_when:
  - When cleaning up backend websocket receive-loop task scheduling, TaskManager admission, task-limit handling, or disconnect cleanup tests.
  - When changing `TaskManager.create_task_if_under_limit` or `schedule_validated_message_task`.
title: "Backend Websocket Task Admission Cleanup Plan"
---

# Backend Websocket Task Admission Cleanup Plan

Date: 2026-06-05

## User Intent

Clean up one specific feature with clear, deterministic paths:

- fewer `if`s and nested branches
- fewer fallback ladders and compatibility shims
- fewer duplicate producers for the same behavior
- inputs normalized once at the boundary
- invalid state fails fast instead of silently degrading
- core logic runs through one obvious path
- separate named handlers for real states
- deletion of old paths when no longer required
- tests that prove the single intended path

For this pass, the feature is backend websocket validated-message task
admission: deciding whether an incoming websocket message gets scheduled as a
handler task or rejected with the task-limit error.

## Current State And Constraints

- The worktree contains a large unrelated frontend/minimal-chat-p Surface cleanup
  and an unrelated simple-chat CLI edit. This plan must not touch, stage, or
  report those files.
- The backend websocket task manager currently owns active task tracking,
  concurrency enforcement, done-task pruning, rejected coroutine closing, and
  disconnect cleanup.
- `TaskManager.create_task_if_under_limit(...)` returns
  `(task_or_none, limit_exceeded)`.
- Production receive-loop code does not use the accepted task object. It only
  needs the admission decision, because `TaskManager` already stores and cleans
  up accepted tasks internally.
- `schedule_validated_message_task(...)` currently discards the accepted task
  with `_ = task`, which is a concrete sign that the public helper contract is
  wider than the runtime truth.
- Tests currently use the returned task for await/cancel assertions. Those tests
  can instead assert through `manager.active_tasks`, preserving the real
  ownership contract: TaskManager owns scheduled tasks.

## Architectural Change

The source of truth becomes:

- `TaskManager` owns task object creation, tracking, callback eviction, pruning,
  rejected-input closing, and cleanup.
- The receive-loop helper owns route-level branch behavior only: accepted
  messages continue silently; rejected messages send the deterministic
  `"Too many concurrent requests. Please wait."` error.
- Callers outside `TaskManager` do not receive or manage accepted task objects.

The intended final shape is one admitted/not-admitted decision path instead of a
tuple whose first value is unused by production.

## Out Of Scope

- Changing websocket message schemas, auth, validation, or close-code policy.
- Changing the max-concurrent-tasks configuration value or task limit semantics.
- Removing rejected coroutine close behavior.
- Removing done-task pruning or bounded disconnect cleanup.
- Changing session teardown, handler execution, or websocket router
  registration.
- Touching frontend/minimal-chat-pill files currently dirty in the worktree.

## Ordered Plan

1. Confirm the live caller surface.
   - Search all uses of `create_task_if_under_limit(...)`.
   - Verify production code only needs the admission decision.
   - Verify tests that use the returned task can assert through
     `active_tasks` without weakening coverage.

2. Narrow `TaskManager.create_task_if_under_limit(...)`.
   - Rename the method only if the current name becomes misleading; otherwise
     keep the method name to avoid needless churn.
   - Change the return contract from `(task_or_none, limit_exceeded)` to a
     single boolean admission result.
   - Prefer positive semantics such as `True` for accepted and `False` for
     rejected, so the route reads as one direct admission path.
   - Keep create-task failure behavior unchanged: close the input if possible
     and re-raise.

3. Delete the unused route helper path.
   - Update `schedule_validated_message_task(...)` to branch only on the
     admission boolean.
   - Delete the unused accepted-task binding and `_ = task` placeholder.
   - Keep the same deterministic client error on rejection.

4. Update tests to prove the owner boundary.
   - Update task-manager tests to inspect `active_tasks` for the created task
     when they need to await or assert cancellation.
   - Keep coverage for concurrency rejection, rejected coroutine close,
     close-failure swallowing, done-task pruning, create-task failure,
     non-awaitable rejection, cleanup cancellation, timeout logging, orphan
     logging, and callback behavior.
   - Update loop-runtime dummy task manager to return the new admission boolean.
   - Avoid adding tests that depend on callers owning task objects.

5. Update docs and changelog.
   - Update the task-manager contract reference to describe the boolean
     admission contract and internal task ownership.
   - Update the backend websocket lifecycle reference where it currently
     describes the old tuple.
   - Add a changelog entry for the backend websocket cleanup.

6. Create a matching report while executing.
   - Add `docs/plans/2026-06-05-backend-websocket-task-admission-cleanup-report.md`
     after approval.
   - Track checklist status, validation results, decisions, blockers,
     deviations, and commit evidence.

## Checklist

- [ ] All `create_task_if_under_limit(...)` call sites are audited.
- [ ] Production receive-loop code no longer receives or discards a task object.
- [ ] `TaskManager` still tracks accepted tasks internally.
- [ ] Task-limit rejection still closes the incoming coroutine.
- [ ] `asyncio.create_task(...)` failure still closes the incoming coroutine and
      re-raises.
- [ ] Done-task pruning before limit checks remains intact.
- [ ] Disconnect cleanup cancellation and zombie diagnostics remain intact.
- [ ] Tests assert task ownership through `TaskManager.active_tasks`, not a
      returned task handle.
- [ ] Docs describe one admission result and internal task ownership.
- [ ] Changelog is updated before commit.
- [ ] Matching report file records validation and commit evidence.

## Success Criteria

- The websocket receive-loop task scheduling path has one obvious branch:
  admitted or rejected.
- No production caller receives an accepted task object that it does not own.
- The `_ = task` placeholder in `loop_runtime.py` is deleted.
- Rejection still emits exactly `"Too many concurrent requests. Please wait."`.
- Rejected coroutine closing remains covered and unchanged.
- Cleanup still cancels and prunes internally tracked tasks.
- The change removes a false public return value without adding a new adapter or
  fallback path.

## Validation Commands

Minimum focused validation:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_task_manager.py tests/backend/test_websocket_loop_runtime.py -q
./bin/docs-list
rg -n "create_task_if_under_limit\\(|limit_exceeded|_ = task" backend/src tests/backend docs
git diff --check
```

If route-level behavior changes unexpectedly, also run:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_route.py -q
```

## Assumptions

- No public API migration is required because `TaskManager` is an internal
  backend route helper, not a hosted SDK or websocket payload contract.
- No persisted-data migration is required because this changes only in-memory
  scheduling return shape.
- The current tuple return exists from an older test/caller shape, not because
  production callers should manage accepted task objects.
- The active frontend/minimal-chat-pill dirty work is unrelated and must remain
  untouched during this backend cleanup.
