---
summary: "Deep reference for query websocket handling: active-task registration, runtime state seeding, screenshot artifact resolution, stream completion backfill semantics, and TTS lifecycle boundaries."
read_when:
  - When changing `QueryMessageHandler` or `QueryExecutionService` event/terminal behavior.
  - When debugging missing completions, empty-final-response fallback text, screenshot-ref loading, or cancellation logging in query runs.
title: "Query Handler and Query Execution Service Runtime Reference"
---

# Query Handler and Query Execution Service Runtime Reference

## Canonical Modules

- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/processing/pipeline.py`
- `tests/backend/test_api_handlers.py`

## Ownership Split

`QueryMessageHandler` is a typed websocket ingress adapter:

- validates `QueryMessage` shape via `TypedMessageHandler`
- registers/clears active query task in `SessionManager`
- delegates execution to `QueryExecutionService`
- catches cancellation/validation/unexpected exceptions and emits sanitized error envelopes

`QueryExecutionService` owns runtime orchestration:

- query text validation (`validate_query_text`)
- session acquisition (`get_or_create_session`)
- per-query context construction (`user_id`, `session_id`, `conversation_ref`, `turn_ref`)
- event stream processing through `StreamPipeline`
- terminal completion fallback rules
- TTS session lifecycle and drain/flush sequencing

## Active Query Task Lifecycle

`QueryMessageHandler.handle_typed(...)`:

1. resolves `current_task`
2. registers task with `register_active_query_task(user_id, task, turn_ref, conversation_ref)`
3. executes query service
4. always clears the same task in `finally`

Cancellation behavior:

- `CancelledError` is logged with user/turn/conversation refs and re-raised
- stop-query path depends on this task registration map to signal cancellation

## Query Payload Ingress and Runtime Seeding

`QueryExecutionService.execute(...)` consumes `QueryMessage.payload` fields:

- `text` -> validated prompt text
- `conversation_ref` -> stream context + session routing
- `content` -> model-facing structured content forwarded to `process_query(...)`
- `screenshot` / `screenshot_ref` -> screenshot resolution path
- `system_state_internal` -> backend-only runtime state seed

### `system_state_internal` merge semantics

Only string keys are considered:

- `active_window`
- `mouse_position`
- `screen_resolution`

Service merges incoming state over any existing state returned by `agent_instance.get_current_system_state()` and writes via `set_current_system_state(...)` when available. Failures are non-fatal warnings.

## Screenshot Resolution Precedence

`_resolve_screenshot(...)` policy:

1. if inline `screenshot` exists -> use it
2. else if `screenshot_ref` exists -> load via `ArtifactStore.from_config(...).load_base64(...)`
3. on artifact load failure -> warn and continue with `None`

This preserves query execution even when artifact storage is unavailable.

## Stream Event Processing and Completion Backfill

The service tracks:

- `saw_terminal_event`
- `saw_text_chunk`
- `text_chunks` (non-empty chunk stream)
- `last_assistant_full_text`

For each agent event:

- events go through `_extract_event_type(...)`
- non-empty chunk text captured from `chunk/content/streaming-response` family
- assistant full text captured for `assistant_message_full`
- `streaming-complete` triggers completion resolution and synthetic backfill when required

### Completion text precedence

Resolved in `_resolve_completion_text(...)` using:

1. explicit streaming-complete final response (if present)
2. concatenated non-empty streamed chunks
3. last assistant-full content
4. fallback constant: `I completed the requested action(s), but the model returned an empty final response.`

### Backfill contract

`_emit_completion_events(...)` emits:

- synthetic `ChunkEvent` when no text chunk was seen and completion text is non-empty
- terminal `StreamingCompleteEvent` always

If agent stream ends with no terminal event, service emits fallback completion sequence itself.

## TTS Lifecycle Boundary

`TTSSession` context manager owns per-request TTS resources:

- `__aenter__`: conditional service init + optional audio streaming task start
- query execution: pipeline processes events with optional TTS service
- post-stream: `pipeline.wait_for_pending_tts()` and `tts_service.flush()`
- `__aexit__`: cancel unfinished audio task and call manager cleanup

This keeps handler/service code free of duplicated TTS task bookkeeping.

## Error Envelope Contract

Handler-side errors call `send_error_response(...)` from `api/infrastructure/errors.py`:

- validation errors can surface explicit message text
- unexpected exceptions are sanitized to generic client-safe payload
- transport send failures on closed sockets are swallowed at debug level

## Test-Backed Invariants

`tests/backend/test_api_handlers.py` verifies:

- query path reuses one immutable context object across pipeline events
- silent agent streams emit fallback chunk + completion
- assistant-full-only path backfills chunk before completion
- active query cancellation is logged and task map is cleared
- screenshot resolution precedence: inline screenshot beats `screenshot_ref`
- missing screenshot artifact logs warning and continues
- runtime `system_state_internal` applies to agent runtime state before processing
- extractor helpers honor precomputed event type and payload/top-level fallbacks

## Drift Hotspots

1. breaking `register_active_query_task`/`clear_active_query_task` symmetry causes stop-query misfires or leaked task references.
2. changing completion precedence/backfill ordering can regress frontend phase transitions.
3. removing context reuse in pipeline calls increases per-event allocations on hot paths.
4. altering screenshot-ref fallback to hard-fail can block query execution on artifact outages.

## Related Pages

- [Backend API Handlers Docs Hub](README.md)
- [Backend API Services Docs Hub](../services/README.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](../services/query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](non_query_handler_dispatch_and_payload_normalization_reference.md)
- [Handler Behavior Matrix](../handler_behavior_matrix.md)
- [Stop-Query and Control Flow Reference](../non_query_handler_and_control_flow_reference.md)
