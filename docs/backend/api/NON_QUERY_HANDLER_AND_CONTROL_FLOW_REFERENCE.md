---
summary: "Backend non-query websocket handler reference for settings/model listing, stop-query cancellation, wakeword activation, and transcript rehydrate flow."
read_when:
  - When changing websocket handlers outside core query streaming.
  - When debugging settings ACK mismatches, stop-query behavior, wakeword greeting flow, or rehydrate transcript reconstruction.
title: "Non-Query Handler and Control Flow Reference"
---

# Non-Query Handler and Control Flow Reference

## Canonical Modules

- `backend/src/api/handlers/settings.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/wakeword.py`
- `backend/src/api/handlers/rehydrate.py`
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
3. return frontend-owned settings subset only via `_build_frontend_settings_payload(...)`

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

1. validate payload through `validate_frontend_config(...)`
2. ignore non-frontend-owned fields (warning only)
3. apply validated patch via `SessionManager.update_session_config(user_id, updates)`
4. return updated key list

Response type:

- `settings-updated`

Validation scope (`FrontendConfigPatch`):

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `voice_mode_enabled`
- `speech_mode_enabled`
- `include_query_screenshot`

## Stop Query Control Path

`stop-query` -> `StopQueryHandler`

Behavior:

1. call `SessionManager.cancel_active_query_task(user_id)`
2. if task canceled, capture `(turn_ref, conversation_ref)` metadata
3. always emit terminal success envelope so renderer exits active streaming UI state

Response type emitted by handler:

- `streaming-complete` (even when no task was active)

Cancellation source of truth:

- session manager `_active_query_tasks` map (`task -> (turn_ref, conversation_ref)`) per user

## Wakeword Control Path

`wakeword-detected` -> `WakewordHandler` -> `WakewordExecutionService`

Execution sequence:

1. pick greeting through `WakewordService.select_greeting()`
2. emit activation payload (`voice_mode_enabled`, `speech_mode_enabled`, status)
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
2. normalize frontend transcript entries into backend history entry format
3. resolve screenshot payload from inline data or artifact refs
4. reconstruct tool-call/tool-output linkage (`tool_call_id`/`correlation_id`) when possible
5. call `session.rehydrate_conversation(conversation_ref, hydrated_entries)`

Normalization behavior highlights:

- tool-call message variants normalized (`tool-call`, `tool_call`, `tool-bundle`, `tool_bundle`)
- tool-output variants normalized similarly
- missing tool-call IDs can trigger synthetic tool-call history entries for linkage continuity
- malformed `tool_calls` blocks are sanitized/dropped rather than crashing

## Error Semantics

- handler-level validation errors use `send_error_response(...)` with explicit validation message
- unexpected exceptions use sanitized error payload path
- stop-query includes defensive catch and error send path (no silent failure)

## Debug Checklist

If settings UI shows save success but config did not apply:

1. verify payload keys are in frontend-owned field set
2. inspect warnings for ignored unknown keys
3. verify `SessionManager.update_session_config(...)` ran and session existed

If stop-query does not unblock UI:

1. verify frontend sends `stop-query` on same `user_id`
2. verify active task was registered in query handler path
3. verify `streaming-complete` response reached renderer channel

If wakeword greets but no audio:

1. verify `speech_mode_enabled` in wakeword service config
2. inspect TTS session initialization/flush logs
3. inspect audio completion timeout warnings for streaming interruptions

If rehydrate loses tool linkage:

1. verify transcript entries include `tool_call_id` or `correlation_id`
2. inspect normalized tool-call generation path for synthetic IDs
3. verify artifact screenshot refs are resolvable in backend artifact store
