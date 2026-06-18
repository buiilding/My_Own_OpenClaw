---
summary: "Backend non-query websocket handler reference for settings/model listing, stop-query cancellation, manual compaction flow, wakeword activation, and transcript rehydrate flow."
read_when:
  - When changing websocket handlers outside core query streaming.
  - When debugging settings ACK mismatches, stop-query behavior, manual compaction events, wakeword greeting flow, or rehydrate transcript reconstruction.
title: "Non-Query Handler and Control Flow Reference"
---

# Non-Query Handler and Control Flow Reference

## Canonical Modules

- `backend/src/api/handlers/settings.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/wakeword.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/handlers/compact_history.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/agent/session/manager.py`
- `backend/src/core/validation/validators.py`
- `backend/src/api/contracts/message_types.py`

## Settings and Model Handlers

### `load-settings` -> `LoadSettingsHandler`

Behavior:

1. resolve session by `user_id`
2. prefer session config (`session.cfg`); fallback to global config (`session_manager.config`)
3. return client settings subset only via `_build_client_settings_payload(...)`

Response type:

- `settings-loaded`

### `list-models` -> `ListModelsHandler`

Behavior:

1. call `ModelService.get_all_models()`
2. return model bundles (`local`, `online`, `vision`)

Response type:

- `models-listed`

### `update-settings` -> `UpdateSettingsHandler`

Behavior:

1. validate payload through `validate_client_settings_patch(...)`
2. ignore non-client-settings fields (warning only)
3. apply validated patch via `SessionManager.update_session_config(user_id, updates)`
4. return updated key list

Response type:

- `settings-updated`

Validation scope (`ClientSettingsPatch`):

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `browser_automation_enabled`
- `include_query_screenshot`
- `provider_api_keys`

## Manual Compaction Control Path

`compact-history` -> `CompactHistoryHandler`

Behavior:

1. read `force` flag from payload
2. reject when an active query task exists for this user
3. create/load session and build user/session context metadata
4. execute `session.run_history_compaction(reason=\"manual\", force=force)`
5. emit lifecycle events:
  - `context-compaction-started` when decision says compaction should run
  - `context-compaction-completed` with either applied stats or `skipped_reason`

Active-query rejection behavior:

- emits `context-compaction-failed` with manual reason and user-facing guidance
- does not start compaction engine

## Stop Query Control Path

`stop-query` -> `StopQueryHandler`

Behavior:

1. call `SessionManager.cancel_active_query_task(user_id, conversation_ref=..., turn_ref=...)`
   - `conversation_ref` and `turn_ref` scope cancellation to the intended active turn when supplied
2. if task canceled, capture `(turn_ref, conversation_ref)` metadata
3. if no task is currently registered, SessionManager stores a short-lived pending stop intent (race guard for query task registration)
4. emit a control acknowledgement; SDK/current-turn projection owns local terminalization

Response type emitted by handler:

- `stop-query-ack` (even when no task was active)

Cancellation source of truth:

- session manager `_active_query_tasks` map (`task -> (turn_ref, conversation_ref)`) per user
- short-lived `_pending_stop_requests` latch consumed by `register_active_query_task(...)` to cancel a just-starting query if stop arrived first

## Wakeword Control Path

`wakeword-detected` -> `WakewordHandler` -> `WakewordExecutionService`

Execution sequence:

1. pick greeting through `WakewordService.select_greeting()`
2. emit activation payload (`speech_mode_enabled`, status)
3. emit greeting text event
4. if speech enabled via TTS session, synthesize and flush greeting audio
5. wait for audio stream completion best-effort with timeout guards

Response types:

- `wakeword-activated`
- `wakeword-greeting`

## Rehydrate Conversation Path

`rehydrate-conversation` -> `RehydrateConversationHandler` -> `RehydrateExecutionService`

Execution sequence:

1. get/create session
2. validate SDK rehydrate transcript entries into backend history entry format
3. resolve screenshot payload from inline data or artifact refs
4. validate tool-call/tool-output linkage (`tool_call_id`/`correlation_id`)
5. call `session.rehydrate_conversation(conversation_ref, hydrated_entries)`

Normalization behavior highlights:

- explicit message types must already be canonical stored values such as
  `user_query`, `assistant_response`, `tool_output`, or `context_compaction`
- SDK-projected assistant rows carry structured `tool_calls`; backend rehydrate
  does not parse stale JSON-content tool-call aliases
- missing or unknown tool-call IDs fail rehydrate instead of synthesizing repair
  history
- malformed `tool_calls` blocks are sanitized/dropped before linkage
  validation

## Error Semantics

- handler-level validation errors use `send_error_response(...)` with explicit validation message
- unexpected exceptions use sanitized error payload path
- stop-query includes defensive catch and error send path (no silent failure)

## Debug Checklist

If settings UI shows save success but config did not apply:

1. verify payload keys are in the client settings patch field set
2. inspect warnings for ignored unknown keys
3. verify `SessionManager.update_session_config(...)` ran and session existed

If stop-query does not unblock UI:

1. verify frontend sends `stop-query` on same `user_id`
2. verify active task was registered in query handler path
3. verify SDK/current-turn projection produced local stop terminalization
4. verify backend emitted `stop-query-ack` without `event_id` or `sequence`

If wakeword greets but no audio:

1. verify `speech_mode_enabled` in wakeword service config
2. inspect TTS session initialization/flush logs
3. inspect audio completion timeout warnings for streaming interruptions

If rehydrate loses tool linkage:

1. verify transcript entries include `tool_call_id` or `correlation_id`
2. inspect normalized tool-call generation path for synthetic IDs
3. verify artifact screenshot refs are resolvable in backend artifact store

## Related Docs

- [History Compaction Engine Decision, Strategy, and Event Contract Reference](../agent/history_compaction_engine_decision_strategy_and_event_contract_reference.md)
