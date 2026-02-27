---
summary: "Deep reference for non-query websocket handlers: typed dispatch contract, stop-query completion semantics, settings/model handlers, tool-result normalization, rehydrate reconstruction, and wakeword greeting/TTS flow."
read_when:
  - When changing non-query message handlers in `backend/src/api/handlers/*`.
  - When debugging tool-result/session routing, settings update validation, or rehydrate/wakeword behavior differences across clients.
title: "Non-Query Handler Dispatch and Payload Normalization Reference"
---

# Non-Query Handler Dispatch and Payload Normalization Reference

## Canonical Modules

- `backend/src/api/infrastructure/handler.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/tool_result.py`
- `backend/src/api/handlers/settings.py`
- `backend/src/api/handlers/rehydrate.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/api/handlers/wakeword.py`
- `backend/src/api/services/wakeword_execution.py`
- `backend/src/api/schemas/incoming.py`
- `tests/backend/test_api_handlers.py`

## Typed Handler Boundary

Handlers inherit one of:

- `TypedMessageHandler[MessageT]`: enforces `message_model` via runtime `isinstance`
- `MessageHandler`: custom validation path (`ToolResultHandler` handles two message models)

If typed validation fails, `TypedMessageHandler.handle(...)` raises `TypeError` before business logic runs.

## Shared Success/Error Envelope Contract

All handlers use infrastructure helpers:

- `send_success_response(...)`
- `send_error_response(...)`

Properties:

- canonical transport message shape
- optional context attachment (`user_id`, `session_id`, turn metadata)
- exception sanitization for client-safe error payloads
- closed-socket send failures treated as expected debug-level drops

## `StopQueryHandler` Semantics

`stop-query` behavior:

- calls `session_manager.cancel_active_query_task(user_id)`
- derives optional context: `session_id`, `turn_ref`, `conversation_ref`
- context helper trims optional `session_id`/`conversation_ref` and drops blank/non-string values
- always emits `streaming-complete` success response, even when no active task exists

Reason: frontend must always exit active streaming state when stop is requested.

## `ToolResultHandler` Normalization and Routing

Accepted inbound types:

- `tool-result`
- `tool-bundle-result`

Single result path:

- `_serialize_tool_result_data(...)` converts payload `data` to plain dict
- supports `dict` and Pydantic `model_dump(...)`
- unexpected payload types logged and normalized to `None`
- delegates to `session.process_frontend_tool_result(...)`

Bundle path:

- `_serialize_step_results(...)` normalizes each step to plain dict
- preserves extra step fields (`extra="allow"` schema behavior)
- forwards `bundle_id/status/step_results/screenshot/screenshot_ref/system_state/error`
- delegates to `session.process_frontend_tool_bundle_result(...)`

Missing session behavior:

- treated as benign stale result
- logs debug and drops message without websocket response

## Settings and Model Handlers

### `LoadSettingsHandler`

- sources config from active session when available
- falls back to global `session_manager.config`
- returns only frontend-owned keys from `FRONTEND_CONFIG_FIELDS`
- payload key ordering is deterministic (`sorted(...)`) for stable tests

### `UpdateSettingsHandler`

- validates payload via `validate_frontend_config(...)`
- only frontend-owned fields allowed
- applies updates through `session_manager.update_session_config(user_id, updates)`
- returns `settings-updated` with `updated_keys`

Frontend-owned field set:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `voice_mode_enabled`
- `speech_mode_enabled`
- `wakeword_stt_enabled`
- `include_query_screenshot`

### `ListModelsHandler`

- delegates to `ModelService.get_all_models()`
- responds with `models-listed`

## Rehydrate Handler + Service Boundary

`RehydrateConversationHandler` only delegates to `RehydrateExecutionService.execute(...)`.

`RehydrateExecutionService` owns transcript normalization:

- resolves image data from inline screenshot or `screenshot_ref`
- converts tool-call style rows into assistant tool-call entries
- ensures subsequent tool-output rows have `tool_call_id`
- synthesizes fallback call ids when absent
- preserves assistant `tool_calls` lists when provided
- invokes `session.rehydrate_conversation(conversation_ref, hydrated_entries)`

Artifact behavior:

- artifact store creation failure: warning + continue
- per-message screenshot-ref load failure: warning + continue without image
- if screenshot-ref exists but store unavailable: explicit error for that entry path

## Wakeword Handler + Service Flow

`WakewordHandler` delegates to `WakewordExecutionService`.

Service sequence:

1. choose greeting via `WakewordService.select_greeting()`
2. send `wakeword-activated` payload
3. send `wakeword-greeting` text payload
4. if TTS enabled, process greeting text + flush + wait for audio completion window

`TTSSession` context manager handles setup/teardown and streaming task cleanup.

## Schema Constraints (Ingress)

Defined in `backend/src/api/schemas/incoming.py`:

- `QueryPayload`, `UpdateSettingsPayload`, `ToolResultPayload`, `ToolBundleResultPayload` enforce explicit shape
- most payload models use `extra="forbid"`
- tool-result data and bundle step result models allow extra keys for tool-specific content

This split keeps envelope strict while preserving per-tool extensibility.

## Test-Backed Invariants

`tests/backend/test_api_handlers.py` verifies:

- stop-query emits `streaming-complete` with context refs and cancels task
- tool-result data model normalization keeps `system_state` and screenshot refs
- non-computer tool results can omit `system_state`
- bundle step outputs preserve nested/extra output fields
- missing tool-result session is no-op
- settings update rejects invalid values and emits `error`
- load-settings returns frontend-owned key subset
- wakeword sends activation then greeting events
- rehydrate rebuilds tool-call/tool-output linkage for resumed transcripts
- shared context helper tests (`tests/backend/test_handler_context.py`) verify trimmed session/conversation refs and blank/non-string drop behavior

## Drift Hotspots

1. changing tool-result serialization can break downstream session domain expectations (`dict` payload contract).
2. removing stop-query unconditional completion can leave renderer stuck in active phase.
3. loosening update-settings validation can bypass frontend-owned config boundary.
4. changing rehydrate tool-call synthesis rules can orphan tool outputs from tool_call ids.

## Related Pages

- [Backend API Handlers Docs Hub](README.md)
- [Backend API Services Docs Hub](../services/README.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](../services/rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)
- [Query Handler and Query Execution Service Runtime Reference](query_handler_and_query_execution_service_runtime_reference.md)
- [Handler Behavior Matrix](../handler_behavior_matrix.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
