---
summary: "Agent session runtime reference: SessionManager locking/session maps, AgentSession state containers, AgentSession ocr_service constructor removal, ocr_router session_factory wiring, transcript-thread switching, and runtime config update rewiring across executor dependencies."
read_when:
  - When changing per-user session creation/update/end behavior or query-task cancellation.
  - When debugging settings updates that appear in config but not in live LLM responses.
  - When resolving stale `AgentSession(..., ocr_service=...)`, session factory OCR service parameter, or sub-agent OCR constructor references.
title: "Session Runtime and Config Rewire Reference"
---

# Session Runtime and Config Rewire Reference

## Canonical Modules

- `backend/src/agent/session/manager.py`
- `backend/src/agent/session/session_registry.py`
- `backend/src/agent/session/session_config_service.py`
- `backend/src/agent/session/active_query_tracker.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/initializer.py`
- `backend/src/agent/session/runtime_state.py`
- `backend/src/agent/session/config_runtime.py`
- `backend/src/agent/session/lifecycle.py`
- `tests/backend/test_session_manager.py`
- `tests/backend/test_session_cleanup.py`

## Ownership Boundaries

`SessionManager` is now the facade only. The actual ownership split is:

- `SessionRegistry`
  - session map keyed by `(user_id, conversation_ref)`
  - per-user locks
  - latest-conversation tracking and cleanup
- `SessionConfigService`
  - per-user config overrides
  - effective-config assembly for new/existing sessions
  - client-supplied operating-system prompt rewrites
- `ActiveQueryTracker`
  - active task registration
  - stop-query cancellation / pending-stop consumption

This boundary matters because handlers/services should still depend on `SessionManager`, but runtime ownership should not drift back into one file.

`AgentSession` owns per-session mutable runtime:

- conversation history
- executor + tool-result handler
- runtime state containers (`SessionRuntimeState`)
- session-scoped async lock (`self._lock`)
- `ocr_router` reference used by screenshot/OCR preparation state

## Session Creation and Locking Model

`SessionManager.get_or_create_session(user_id, conversation_ref=...)` uses:

1. fast path without lock when session already cached
2. `SessionRegistry` per-user lock slow path
3. double-check after lock acquisition
4. `SessionConfigService` detached `AppConfig` copy + per-user override merge + runtime normalization
5. factory `create_agent_session(user_id, config)` and cache insert under the requested conversation ref
6. apply any client-supplied operating-system override already registered for that user so prompt/history use the client OS instead of the backend host OS

Container-owned default session creation preserves the distinction between the
factory base config and a real session-specific config override:

- default `Container.create_agent_session(...)` calls the LLM factory without a config argument so the DI `llm_client` provider can be overridden by tests/simulation/runtime containers
- explicit config overrides still call the config-aware LLM factory branch and become the session `cfg`
- `SessionRuntimeCoordinator` passes the container `ocr_router` into
  `AgentSessionFactory`, and `AgentSession` stores only `self.ocr_router`.
  Do not add an `ocr_service` constructor alias back onto `AgentSession`;
  tool-preparation code reads the router from `session.ocr_router`.

### Removed `AgentSession(..., ocr_service=...)` Constructor Parameter

Stale references to `AgentSession ocr_service constructor removed ocr_router
session_factory` belong here, not in the OCR engine/service lifecycle docs.
The current session-construction path is:

1. `SessionRuntimeCoordinator` reads `container.ocr_router`.
2. `AgentSessionFactory(..., ocr_router=...)` stores that router dependency.
3. `AgentSession(..., ocr_router=...)` stores `self.ocr_router`.
4. `AgentFactory.create_agent(...)` copies `parent_session.ocr_router` into
   child sessions.

Tool context injection uses the same `ocr_router` name; do not reintroduce a
separate `ocr_service` service key when touching OCR wiring.

Agent definition updates layer onto existing session prompt context. When an
agent definition changes workspace, client prompt layers, tool manifest, or
system-prompt override, `SessionConfigService` preserves the session's existing
repo instruction messages and rewrites only the agent-owned prompt pieces.

Concurrency properties:

- user-level lock prevents duplicate session creation races while still allowing multiple cached conversations per user
- `tests/backend/test_session_manager.py::test_get_or_create_session_is_race_safe` validates single creation under concurrent calls

## Active Query Task Tracking

`ActiveQueryTracker` tracks task -> `(turn_ref, conversation_ref)` per user:

- `register_active_query_task(...)`
- `register_active_query_task_with_limits(...)`
- `cancel_active_query_task(...)`
- `clear_active_query_task(...)`

Admission behavior:

- `register_active_query_task_with_limits(...)` prunes done tasks, checks
  per-user/global active-query caps, consumes pending stops, and registers the
  accepted task under one tracker lock
- rejected queries are not inserted into the active-task map

Cancellation behavior:

- cancels all live tasks for user
- optional `conversation_ref` scopes cancellation to one active conversation
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
- `active_conversation_ref` (stable per conversation-scoped session in the normal path)
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

Query-scoped prompt/runtime inputs are also applied under that same lock:

- client-supplied operating-system + workspace/repo instruction prompt context
- backend-only `system_state_internal` merge for the turn

This keeps per-conversation mutable state atomic for one active turn while still
allowing different conversation-scoped sessions for the same user to run concurrently.

This avoids:

- config updates racing with in-flight prompt/execution mutation
- transcript rehydrate races with active turn history writes
- conversation thread switch races on shared history state

Websocket task-pool safety:

- `update-settings` handlers use `try_update_config(...)` for active sessions
  so they do not wait behind a long-running query while occupying one of the
  websocket route-dispatch task slots.
- If the session lock is busy, `SessionConfigService` stores the user override
  immediately and schedules one coalesced deferred rewire task per user. That
  background task waits outside the websocket handler and applies the latest
  config version when the session lock becomes available.
- This preserves the no-race config rewire contract without allowing repeated
  settings sync messages to starve tool-result or stop-query control traffic.

## Conversation Thread Switching

`process_query(..., conversation_ref=...)` calls `_switch_conversation_ref(...)`:

- if same ref: keep history
- if changed: update `runtime.active_conversation_ref` and clear history

Current expectation after the multi-conversation refactor:

- normal query/rehydrate flow resolves the matching conversation session first, so `_switch_conversation_ref(...)` is usually a no-op
- history clearing on conversation switch remains as defensive behavior for legacy/default-session paths

`rehydrate_conversation(conversation_ref, entries)`:

- sets active conversation ref
- replaces history from SDK-projected snapshot entries (`replace_with_entries`)

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

`SessionManager.end_session(user_id, conversation_ref=None)`:

- acquires user lock
- when `conversation_ref` is provided, cleans up only that conversation-scoped session
- when omitted, cleans up all sessions for the user
- always removes cleaned sessions from cache even if cleanup errors

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
4. New conversation-bound routing must preserve request-id and bundle-id lookup, or SDK-submitted tool results can land on the wrong session.
5. New session-runtime responsibilities should land in `SessionRegistry`, `SessionConfigService`, or `ActiveQueryTracker` first; `SessionManager` should stay a narrow facade.
