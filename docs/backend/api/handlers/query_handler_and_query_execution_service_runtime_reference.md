---
summary: "Deep reference for query websocket handling: active-task registration, runtime state seeding, multi-screenshot artifact resolution, stream completion backfill semantics, and TTS lifecycle boundaries."
read_when:
  - When changing `QueryMessageHandler` or `QueryExecutionService` event/terminal behavior.
  - When debugging missing completions, empty-final-response fallback text, screenshot artifact loading (`screenshot_ref`/`screenshot_refs`), or cancellation logging in query runs.
title: "Query Handler and Query Execution Service Runtime Reference"
---

# Query Handler and Query Execution Service Runtime Reference

## Canonical Modules

- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_execution_support/query_execution_cancellation.py`
- `backend/src/api/services/query_execution_support/query_execution_inputs.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_runtime.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
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
- active stream context publication on the session while the query is running, then cleanup in `finally`
- event stream processing through `StreamPipeline`
- terminal completion fallback rules
- TTS session lifecycle and drain/flush sequencing

`query_execution_runtime.py` contains pure helper paths reused by `QueryExecutionService` wrappers:

- screenshot/reference resolution (`resolve_screenshots`)
- screenshot capture metadata normalization (`resolve_query_screenshot_metadata`)
- runtime system-state filtering/merge (`resolve_query_runtime_system_state`, `apply_query_runtime_system_state`)
- per-turn stream context assembly (`build_stream_context`)

`query_execution_inputs.py` owns query payload shaping for agent ingress:

- screenshot ref normalization (`image_refs` for artifact-backed screenshots)
- screenshot/capture metadata and payload field resolution for `process_query(...)`
- stable extraction of `message_content` and `conversation_ref` from query payload

`query_execution_cancellation.py` owns cancelled-turn reconciliation:

- best-effort history hook invocation for pending tool-call finalization
- warning/info log emission with turn/session correlation fields
- no-op behavior when history lacks cancellation reconciliation support

`query_execution_stream_state.py` centralizes mutable stream-tracking fields used during one query run:

- terminal-event latch (`saw_terminal_event`)
- text chunk aggregation (`saw_text_chunk`, `text_chunks`)
- assistant-full fallback text tracking (`last_assistant_full_text`)

`query_execution_pipeline_events.py` owns stream pipeline send helpers:

- per-event forwarding with shared stream context
- completion backfill + terminal emission ordering
- typed shared helper boundary used by service wrapper methods

## Active Query Task Lifecycle

`QueryMessageHandler.handle_typed(...)`:

1. resolves `current_task`
2. asks `SessionManager.register_active_query_task_with_limits(...)` to apply
   per-user/global active-query caps and register the task in one tracker
   operation
3. executes query service
4. always clears the same task in `finally`

Cancellation behavior:

- `CancelledError` is logged with user/turn/conversation refs and re-raised
- stop-query path depends on this task registration map to signal cancellation
- accepted queries are registered before execution starts; over-cap queries are
  rejected without entering `QueryExecutionService`
- `QueryExecutionService` performs cancellation reconciliation before re-raise: if history has staged tool-call ids, it writes synthetic `role='tool'` outputs so the next provider request does not fail assistant-tool-call sequencing validation.

## Query Payload Ingress and Runtime Seeding

`QueryExecutionService.execute(...)` consumes `QueryMessage.payload` fields:

- `text` -> validated prompt text
- `conversation_ref` -> stream context + session routing
- `content` -> model-facing structured content forwarded to `process_query(...)`
- `screenshot_ref` / `screenshot_refs[]` -> screenshot resolution path
- `capture_meta` -> frame metadata forwarded to session/executor screenshot ingestion
- `system_state_internal` -> backend-only runtime state seed

### `system_state_internal` merge semantics

Only string keys are considered:

- `active_window`
- `mouse_position`
- `screen_resolution`

Service merges incoming state over any existing state returned by `agent_instance.get_current_system_state()` and writes via `set_current_system_state(...)` when available. Getter and setter failures are non-fatal warnings; if the getter fails, the service still applies the incoming runtime state by itself.
`screen_resolution` remains diagnostic runtime state; coordinate normalization no longer depends on it.

### Active stream context

When the session exposes `set_active_stream_context(...)`, query execution records the backend-owned `turn_ref` and `conversation_ref` before streaming starts. The matching `clear_active_stream_context(...)` runs in `finally`. Tool-result canonical echo paths use this runtime context so client-submitted tool-result envelopes cannot spoof the destination conversation or turn for backend-generated `tool-output` events.

## Screenshot Resolution

Screenshot input policy:

1. normalize artifact refs from `screenshot_refs[]` or fallback single `screenshot_ref`.
2. artifact-backed screenshots flow as `image_refs`.
3. prompt construction resolves refs into bounded model image payloads.

This keeps query transport and history ref-based while preserving multimodal model access at the backend prompt boundary.

## Query Screenshot Metadata Forwarding

`_resolve_query_screenshot_metadata(...)` forwards optional frame metadata from query payload:

- `capture_meta`: dict payload passed through for normalization in screenshot manager

These fields are consumed by session/executor screenshot processing so query-attached screenshots can use the same screenshot_px -> desktop_px contract as tool-result screenshots.

## Stream Event Processing and Completion Backfill

The service tracks:

- `saw_terminal_event`
- `saw_text_chunk`
- `text_chunks` (non-empty chunk stream)
- `last_assistant_full_text`

For each agent event:

- events go through `_extract_event_type(...)`
- non-empty chunk text captured from `content/streaming-response` family
- assistant full text captured for `assistant-message-full`
- `streaming-complete` triggers completion resolution and synthetic backfill when required

### Completion text precedence

Resolved in `_resolve_completion_text(...)` using:

1. explicit streaming-complete final response (if present)
2. concatenated non-empty streamed chunks
3. last assistant-full content
4. fallback constant: `I completed the requested action(s), but the model returned an empty final response.`

### Backfill contract

`query_execution_pipeline_events.emit_completion_events(...)` emits:

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
- cancelled query path reconciles staged tool-call ids through history cancellation hook
- single `screenshot_ref` and multi `screenshot_refs[]` loading paths
- missing screenshot artifacts log warnings and query still continues
- `capture_meta` is forwarded to `process_query(...)`
- runtime `system_state_internal` applies to agent runtime state before processing
- extractor helpers honor precomputed event type and payload/top-level fallbacks

## Drift Hotspots

1. breaking `register_active_query_task`/`clear_active_query_task` symmetry causes stop-query misfires or leaked task references.
2. changing completion precedence/backfill ordering can regress frontend phase transitions.
3. removing context reuse in pipeline calls increases per-event allocations on hot paths.
4. altering screenshot artifact fallback to hard-fail can block query execution on artifact outages.

## Related Pages

- [Backend API Handlers Docs Hub](README.md)
- [Backend API Services Docs Hub](../services/README.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](../services/query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](non_query_handler_dispatch_and_payload_normalization_reference.md)
- [Handler Behavior Matrix](../handler_behavior_matrix.md)
- [Stop-Query and Control Flow Reference](../non_query_handler_and_control_flow_reference.md)
