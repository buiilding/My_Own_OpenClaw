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

## Behavior Summary

### `QueryMessageHandler`

- validates/normalizes query payload
- gets or creates user session
- streams agent events through response formatter + transport
- manages active-query task registration/cleanup
- supports cancellation via task tracking

### `StopQueryHandler`

- cancels active query task for user if present
- always emits streaming completion response so frontend exits active send/stream state
- includes context metadata (`turn_ref`, `conversation_ref`, `session_id`) when available

### `RehydrateConversationHandler`

- applies frontend transcript snapshot into backend in-memory session history
- delegates to `RehydrateExecutionService`

### `ToolResultHandler`

- handles both single and bundle tool result payloads
- normalizes payload models into plain dict forms
- delegates processing to `AgentSession` methods

### `WakewordHandler`

- delegates wakeword activation flow to `WakewordExecutionService`
- supports greeting + optional TTS activation path

### `ListModelsHandler`

- calls `ModelService.get_all_models()`
- responds with grouped local/online/vision model lists

### `LoadSettingsHandler`

- returns frontend-owned settings from session config if session exists
- falls back to global config defaults when session is absent

### `UpdateSettingsHandler`

- validates frontend-owned settings fields
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
