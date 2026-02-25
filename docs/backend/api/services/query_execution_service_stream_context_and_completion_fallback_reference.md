---
summary: "Deep reference for QueryExecutionService runtime behavior: payload ingestion, screenshot/runtime-state resolution, reusable stream context, completion-text precedence, and fallback/backfill event emission semantics."
read_when:
  - When changing `QueryExecutionService.execute` event-processing order or completion behavior.
  - When debugging empty final responses, screenshot-ref fallback loads, or `system_state_internal` runtime-state seeding.
title: "Query Execution Service Stream Context and Completion Fallback Reference"
---

# Query Execution Service Stream Context and Completion Fallback Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/processing/pipeline.py`
- `tests/backend/test_api_handlers.py`

## Service Boundary

`QueryExecutionService` is the orchestration core behind `QueryMessageHandler`.

Handler responsibilities stop at:

- active-query task registration/cleanup
- error handling and response sanitation

Service responsibilities:

- validate query text
- get/create session
- seed runtime system state
- resolve screenshot from inline/ref artifact path
- run agent stream through pipeline
- synthesize fallback completion when stream is incomplete/silent
- coordinate TTS session drain/flush at turn end

## Input Fields Consumed From `QueryMessage.payload`

- `text` -> validated by `validate_query_text`
- `conversation_ref` -> injected into immutable stream context
- `content` -> forwarded as `message_content` to `agent_instance.process_query(...)`
- `screenshot` / `screenshot_ref` -> screenshot resolution path
- `system_state_internal` -> backend-only runtime state seed

## Screenshot Resolution Semantics

`_resolve_screenshot(...)` precedence:

1. if inline `screenshot` exists, return it
2. else if `screenshot_ref` exists, try `ArtifactStore.from_config(...).load_base64(...)`
3. on artifact failure, log warning and return `None`

This path is non-fatal by design; query execution continues without image context when artifact lookup fails.

## Runtime System-State Seeding

`_resolve_query_runtime_system_state(...)` extracts only string values for:

- `active_window`
- `mouse_position`
- `screen_resolution`

`_apply_query_runtime_system_state(...)` then:

- no-ops if agent lacks `set_current_system_state`
- merges extracted fields over existing state from `get_current_system_state` when available
- catches setter failures as warnings

This state is backend-only and not direct prompt text content.

## Reused Stream Context Contract

`_build_stream_context(...)` creates one per-query dict:

- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`

All pipeline sends reuse this same object via `_process_pipeline_event(...)` to reduce hot-path allocations and keep context consistent across events.

## Completion and Backfill State Machine

Execution tracks:

- `saw_terminal_event`
- `saw_text_chunk`
- `text_chunks`
- `last_assistant_full_text`

### Event extraction helpers

Helper parsing/completion logic is single-sourced in `query_event_extraction.py`.
`QueryExecutionService` keeps compatibility wrapper methods.

- `_extract_event_type` supports both dict and dataclass-like events
- `_extract_non_empty_chunk_text` only accepts `chunk/content/streaming-response`
- `_extract_assistant_full_text` only accepts `assistant_message_full`
- `_extract_streaming_complete_text` only accepts `streaming-complete`

### Completion text precedence (`_resolve_completion_text`)

1. explicit `streaming-complete.final_response`
2. concatenated streamed chunk text
3. last assistant-full content
4. fallback constant: `I completed the requested action(s), but the model returned an empty final response.`

### Completion emission (`_emit_completion_events`)

- emits synthetic `ChunkEvent` if no chunk was seen and completion text is non-empty
- always emits terminal `StreamingCompleteEvent`

If agent stream exits with no terminal event, service still emits fallback completion sequence.

## TTS Session Coupling

Within `async with TTSSession(...)`:

- pipeline receives optional `tts_service` for per-event processing
- after stream loop: waits for pending pipeline TTS and flushes service when present

`TTSSession` handles setup/cleanup of audio streaming task and service lifecycle.

## Test-Backed Invariants

`tests/backend/test_api_handlers.py` validates:

- stream context object reuse across events (`first_context is second_context`)
- silent stream fallback emits synthetic chunk + completion
- assistant-full-only path backfills chunk before completion
- extractor helper precedence and payload/top-level fallback behavior
- screenshot-ref load success/failure paths
- inline screenshot precedence over screenshot_ref
- `system_state_internal` application into agent runtime state

## Drift Hotspots

1. changing completion precedence can regress frontend phase transitions.
2. removing synthetic chunk backfill can yield terminal completion with empty visible content.
3. replacing per-query shared context with per-event dicts increases allocation churn and may introduce metadata drift.
4. making screenshot-ref lookup fatal can block query handling on artifact outages.

## Related Pages

- [Backend API Services Docs Hub](README.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)
- [Query Handler and Query Execution Service Runtime Reference](../handlers/query_handler_and_query_execution_service_runtime_reference.md)
