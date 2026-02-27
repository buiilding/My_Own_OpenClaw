---
summary: "Agent session runtime reference: SessionManager locking/session maps, AgentSession state containers, transcript-thread switching, and runtime config update rewiring across executor dependencies."
read_when:
  - When changing per-user session creation/update/end behavior or query-task cancellation.
  - When debugging settings updates that appear in config but not in live LLM responses.
title: "Session Runtime and Config Rewire Reference"
---

# Session Runtime and Config Rewire Reference

## Canonical Modules

- `backend/src/agent/session/manager.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/agent/session/runtime_state.py`
- `backend/src/agent/session/config_runtime.py`
- `backend/src/agent/session/lifecycle.py`
- `tests/backend/test_session_manager.py`
- `tests/backend/test_session_cleanup.py`

## Ownership Boundaries

`SessionManager` owns user-level lifecycle and concurrency:

- `active_sessions[user_id]`
- per-user locks (`_user_locks`)
- active query task metadata (`_active_query_tasks`)

`AgentSession` owns per-session mutable runtime:

- conversation history
- executor + tool-result handler
- runtime state containers (`SessionRuntimeState`)
- session-scoped async lock (`self._lock`)

## Session Creation and Locking Model

`SessionManager.get_or_create_session(user_id)` uses:

1. fast path without lock when session already cached
2. per-user lock slow path
3. double-check after lock acquisition
4. detached `AppConfig` copy + runtime normalization
5. factory `create_agent_session(user_id, config)` and cache insert

Concurrency properties:

- user-level lock prevents duplicate session creation races
- `tests/backend/test_session_manager.py::test_get_or_create_session_is_race_safe` validates single creation under concurrent calls

## Active Query Task Tracking

Manager tracks task -> `(turn_ref, conversation_ref)` per user:

- `register_active_query_task(...)`
- `cancel_active_query_task(...)`
- `clear_active_query_task(...)`

Cancellation behavior:

- cancels all live tasks for user
- drops done tasks
- when stop arrives before task registration, stores a short-lived pending stop request and consumes it on next `register_active_query_task(...)`
- returns latest cancelled tuple for stop-query completion metadata

Validated by:

- `tests/backend/test_session_manager.py::test_cancel_active_query_task_cancels_all_registered_tasks`

## `AgentSession` Runtime Containers

`SessionRuntimeState` fields:

- `screenshot` (`ScreenshotState`)
- `resolved_calls` (`ResolvedToolCallStorage`)
- `tool_results` (`ToolResultStorage(cleanup_ttl_seconds=300)`)
- `system_state`
- `active_conversation_ref`
- `ocr_completion_event`
- tracked `background_tasks`

Key behavior:

- `get_system_state()` returns copy (not mutable internal reference)
- `clear()` clears screenshot/resolved call/result stores and resets event/state
- `register_background_task()` auto-unregisters tasks on completion

## Session Locking Semantics (`AgentSession._lock`)

Critical mutating operations are serialized:

- `update_config(...)`
- `rehydrate_conversation(...)`
- `process_query(...)`

This avoids:

- config updates racing with in-flight prompt/execution mutation
- transcript rehydrate races with active turn history writes
- conversation thread switch races on shared history state

## Conversation Thread Switching

`process_query(..., conversation_ref=...)` calls `_switch_conversation_ref(...)`:

- if same ref: keep history
- if changed: update `runtime.active_conversation_ref` and clear history

`rehydrate_conversation(conversation_ref, entries)`:

- sets active conversation ref
- replaces history from frontend snapshot (`replace_with_entries`)

## Runtime Config Rewire (`SessionConfigRuntime.apply`)

Config update path rewires full dependency chain, not only session object:

1. `session.cfg = new_cfg`
2. recreate `session.llm_client`
3. rebind `session.executor.llm_client`
4. rebind `session.executor.interaction_loop.llm_handler.llm_client`
5. rebuild `PromptConstructor` (preserving previous `system_prompt`)
6. rebind `session.executor.prompt_builder`
7. rebuild/rebind `ConversationContext` inside interaction loop

Why this matters:

- avoids stale LLM client references after settings changes (provider/model/api-key drift)
- keeps prompt-building and llm-handler dependencies aligned to current config

## Session Cleanup Contract

`SessionManager.end_session(user_id)`:

- acquires user lock
- calls `session.cleanup()`
- always removes session, query-task tracking, and lock entries (even if cleanup errors)

`SessionLifecycle.cleanup(session)`:

- unsubscribes `InteractionCompleted` handler
- clears history
- cancels/drains registered background tasks
- clears runtime containers

Validated by:

- `tests/backend/test_session_cleanup.py::test_agent_session_cleanup_clears_active_state_stores`
- `tests/backend/test_session_cleanup.py::test_agent_session_cleanup_cancels_tracked_background_tasks`
- `tests/backend/test_session_manager.py::test_end_session_still_removes_session_when_cleanup_fails`

## Drift Hotspots

1. Adding new executor/session dependencies without config-rewire updates causes partial settings updates.
2. Mutating session state outside `AgentSession._lock` can introduce cross-turn history corruption.
3. Forgetting to register long-lived background tasks in `SessionRuntimeState` breaks deterministic cleanup.
4. Changing query-task tracking tuple shape can break stop-query completion metadata and frontend state closure.
