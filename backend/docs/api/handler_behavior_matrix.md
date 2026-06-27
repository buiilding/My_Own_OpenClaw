---
summary: "Message-handler behavior matrix for backend websocket API, including side effects, dependencies, and response patterns."
read_when:
  - When adding/updating websocket handlers.
  - When debugging why a message type did or did not produce expected output events.
title: "Handler Behavior Matrix"
---

# Handler Behavior Matrix

Handler implementations live in `backend/src/api/handlers/*` and are wired by `ApiContainer`.

## Message Type to Handler Map

- `query` -> `QueryMessageHandler`
- `stop-query` -> `StopQueryHandler`
- `rehydrate-conversation` -> `RehydrateConversationHandler`
- `tool-result` -> `ToolResultHandler`
- `tool-bundle-result` -> `ToolResultHandler`
- `wakeword-detected` -> `WakewordHandler`
- `list-models` -> `ListModelsHandler`
- `load-settings` -> `LoadSettingsHandler`
- `update-settings` -> `UpdateSettingsHandler`
- `compact-history` -> `CompactHistoryHandler`

## Behavior Summary

### `QueryMessageHandler`

- validates/normalizes query payload
- gets or creates user session
- streams agent events through response formatter + transport
- manages active-query task registration/cleanup
- supports cancellation via task tracking

### `StopQueryHandler`

- cancels matching active query task for user if present
- scopes cancellation by payload `conversation_ref` and `turn_ref` when supplied
- emits `stop-query-ack` control traffic; SDK/current-turn projection owns local stop terminalization
- includes context metadata (`turn_ref`, `conversation_ref`, `session_id`) when available

### `RehydrateConversationHandler`

- applies SDK conversation snapshot entries into backend in-memory session history
- delegates to `RehydrateExecutionService`

### `ToolResultHandler`

- handles both single and bundle tool result payloads
- normalizes payload models into plain dict forms
- delegates processing to `AgentSession` methods

### `WakewordHandler`

- delegates wakeword activation flow to `WakewordExecutionService`
- supports greeting + optional TTS activation path

### `CompactHistoryHandler`

- rejects manual compaction while active query task exists for user
- emits `context-compaction-failed` for active-query rejection path
- otherwise runs `session.run_history_compaction(reason=\"manual\", force=payload.force)`
- emits `context-compaction-started` when decision indicates compaction should run
- always emits `context-compaction-completed` (applied or skipped with `skipped_reason`)

### `ListModelsHandler`

- calls `ModelService.get_all_models()`
- responds with grouped local/online/vision model lists

### `LoadSettingsHandler`

- returns client settings from session config if session exists
- falls back to global config defaults when session is absent

### `UpdateSettingsHandler`

- validates client settings patch fields
- applies updates to user session config
- returns updated-key list

## Response Pattern Contract

Handlers should:

- use standardized success/error helpers from `api/infrastructure/errors.py`
- send sanitized errors for unexpected failures
- preserve typed message-model validation at boundary (`TypedMessageHandler`)

## Side-Effect Notes

- Query and stop-query handlers interact with session task tracking.
- Tool result handler mutates session runtime state through result routing/storage.
- Update settings mutates session runtime config, not the global config singleton.
- Compact-history mutates conversation history state and emits compaction lifecycle events.
