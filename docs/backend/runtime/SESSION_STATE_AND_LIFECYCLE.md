---
summary: "Detailed backend session internals: SessionManager locks/maps, AgentSession runtime containers, active query cancellation, and cleanup lifecycle."
read_when:
  - When changing AgentSession or SessionManager behavior.
  - When debugging stuck queries, stale runtime state, or session cleanup leaks.
title: "Session State and Lifecycle"
---

# Session State and Lifecycle

## Main Runtime Owners

Primary modules:

- `backend/src/agent/session/manager.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/session/runtime_state.py`
- `backend/src/agent/session/lifecycle.py`
- `backend/src/agent/tools/preparation/screenshot/state.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`

Responsibilities split:

- `SessionManager`: user-level session registry, locking, query task tracking.
- `AgentSession`: per-user orchestrator wrapping history, executor, tool result handler.
- `SessionRuntimeState`: mutable runtime containers owned by one `AgentSession`.

## SessionManager State Maps and Locks

`SessionManager` keeps these long-lived maps:

- `active_sessions: Dict[user_id, AgentSession]`
- `_user_locks: Dict[user_id, asyncio.Lock]`
- `_active_query_tasks: Dict[user_id, Dict[Task, (turn_ref, conversation_ref)]]`

Locking model:

- `_locks_lock` serializes creation/deletion of per-user locks.
- each user gets one lock used by create/update/end operations.
- session creation uses double-check pattern before and after acquiring lock.

## Session Creation Flow

Called from query/rehydrate/tool-result paths through `get_or_create_session(user_id)`.

Steps:

1. Fast path returns existing `active_sessions[user_id]` when present.
2. Slow path acquires user lock.
3. Global config is copied into a new `AppConfig` instance.
4. Runtime config policy is applied (`assemble_runtime_config`): TTS normalization + provider key loading.
5. `create_agent_session(...)` factory builds session and stores it in `active_sessions`.

Important detail:

- Session config is detached from global singleton config, so per-session frontend updates do not mutate global defaults.

## Active Query Task Lifecycle

Registration:

- `QueryMessageHandler.handle_typed(...)` captures `asyncio.current_task()`.
- task is registered with `(turn_ref=message.id, conversation_ref=payload.conversation_ref)`.

Cancellation:

- `stop-query` calls `SessionManager.cancel_active_query_task(user_id)`.
- manager cancels live tasks, removes finished tasks, returns last cancelled `(turn_ref, conversation_ref)`.
- `StopQueryHandler` always emits `streaming-complete` so renderer exits active phase even if no live task exists.

Cleanup:

- query handler `finally` path clears only its own task reference.
- `end_session(...)` also clears all active query tracking for user.

## AgentSession Runtime Containers

`AgentSession.runtime` is `SessionRuntimeState` with these mutable domains:

- `screenshot: ScreenshotState`
- `resolved_calls: ResolvedToolCallStorage`
- `tool_results: ToolResultStorage(cleanup_ttl_seconds=300)`
- `system_state: Optional[Dict[str, Any]]`
- `active_conversation_ref: Optional[str]`
- `ocr_completion_event: asyncio.Event`
- `background_tasks: set[Task]`

### Screenshot/OCR state (`ScreenshotState`)

- stores only current screenshot + current OCR result set (no history chain).
- tracks one active OCR task with screenshot_id correlation.
- `set_current_screenshot(...)` resets OCR cache for previous frame.
- cleanup cancels active OCR task and clears all screenshot fields.

### Resolved tool call cache (`ResolvedToolCallStorage`)

- key: `request_id`
- value: resolved immutable call (for orchestration/execution continuity)
- operations: register/get/remove/clear

### Tool result wait storage (`ToolResultStorage`)

Tracks four maps plus timestamps:

- pending single results (`_pending_results`)
- single result futures (`_result_futures`)
- bundled results (`_bundled_results`)
- bundle futures (`_bundle_futures`)

Behavior:

- creates futures in sync or async contexts safely.
- resolves/removes futures on tool-result arrival.
- supports TTL cleanup (`cleanup_old_results`) and targeted cleanup by request IDs.
- hard clear during session shutdown (`clear_all`).

## Conversation and Runtime Context

Conversation identity:

- `AgentSession._switch_conversation_ref(...)` resets history when thread changes.
- `rehydrate_conversation(...)` replaces history from frontend transcript snapshot.

System state:

- query execution may seed session runtime from `payload.system_state_internal` (`active_window`, `mouse_position`, `screen_resolution`).
- stored in `SessionRuntimeState.system_state` for coordinate normalization/tool prep.

## Config Updates on Active Sessions

Per-session frontend update path:

1. `UpdateSettingsHandler` validates frontend-owned keys only.
2. `SessionManager.update_session_config(...)` merges updates into session config copy.
3. `SessionConfigRuntime.apply(...)` updates:
- `session.cfg`
- `session.llm_client`
- `executor.llm_client`
- `executor.interaction_loop.llm_handler.llm_client`
- prompt constructor + conversation context coordinator

Global config change path:

- `ConfigurationService` notifies subscribers.
- `SessionManager.on_config_changed(...)` loops through active sessions and applies new config under per-user locks.

## End Session and Cleanup Path

Typical triggers:

- websocket disconnect (`cleanup_connection(...)`)
- explicit teardown flows

`end_session(user_id)` steps:

1. acquire per-user lock
2. call `session.cleanup()`
3. remove from `active_sessions`
4. clear active query task map
5. remove user lock entry

`SessionLifecycle.cleanup(...)` does best-effort runtime release:

- unsubscribes session event bus handlers
- clears conversation history
- cancels/drains tracked background tasks
- clears `SessionRuntimeState` containers

Failure policy:

- cleanup exceptions are logged but do not block session eviction.
