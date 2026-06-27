---
summary: "Deep reference for QueryExecutionService runtime behavior: payload ingestion, multi-screenshot/runtime-state resolution, reusable stream context, completion-text precedence, and fallback/backfill event emission semantics."
read_when:
  - When changing `QueryExecutionService.execute` event-processing order or completion behavior.
  - When debugging empty final responses, screenshot artifact fallback loads (`screenshot_ref`/`screenshot_refs`), or `system_state_internal` runtime-state seeding.
title: "Query Execution Service Stream Context and Completion Fallback Reference"
---

# Query Execution Service Stream Context and Completion Fallback Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_execution_support/query_execution_cancellation.py`
- `backend/src/api/services/query_execution_support/query_execution_inputs.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/tts_session.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/processing/pipeline.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_query_execution_service_helpers.py`
- `tests/backend/test_query_event_extraction.py`

## Service Boundary

`QueryExecutionService` is the orchestration core behind `QueryMessageHandler`.

Handler responsibilities stop at:

- active-query task registration/cleanup
- error handling and response sanitation

Service responsibilities:

- validate query text
- get/create session
- seed runtime system state
- resolve query ingress payload (`image_refs`, `capture_meta`, `message_content`, `conversation_ref`)
- run agent stream through pipeline
- synthesize fallback completion when stream is incomplete/silent
- coordinate TTS session drain/flush at turn end
- on cancelled query tasks, best-effort reconcile pending tool-call IDs into cancelled synthetic tool outputs

## Input Fields Consumed From `QueryMessage.payload`

- `text` -> validated by `validate_query_text`
- `conversation_ref` -> injected into immutable stream context
- `content` -> forwarded as `message_content` to `agent_instance.process_query(...)`
- `screenshot_ref` / `screenshot_refs[]` -> screenshot resolution path
- `capture_meta` -> forwarded to `agent_instance.process_query(...)`
- `system_state_internal` -> backend-only runtime state seed

## Screenshot Resolution Semantics

`query_execution_inputs.resolve_query_execution_inputs(...)` uses screenshot ref precedence:

1. normalize refs from `screenshot_refs[]`; fallback single `screenshot_ref`.
2. return refs as `image_refs` without loading artifact bytes.

`execute(...)` forwards the split contract:

- artifact-backed screenshots -> `image_refs` list
- none -> `image_refs` is `None`

Prompt construction owns later artifact hydration, image preprocessing, and image-specific size validation.

## Runtime System-State Seeding

`query_execution_runtime.resolve_query_runtime_system_state(...)` extracts only string values for:

- `active_window`
- `mouse_position`
- `screen_resolution`

`agent_instance.process_query(...)` applies the resolved runtime state to the
session runtime:

- no-ops if agent lacks `set_current_system_state`
- merges extracted fields over existing state from `get_current_system_state` when available
- catches setter failures as warnings

This state is backend-only and not direct prompt text content.

## Cancellation Reconciliation Path

`execute(...)` catches `asyncio.CancelledError` and calls
`query_execution_cancellation.finalize_pending_tool_calls_on_cancel(...)` before
re-raising.

`finalize_pending_tool_calls_on_cancel(...)` behavior:

- inspects `agent_instance.history.finalize_pending_tool_calls_as_cancelled` dynamically
- no-ops when history or finalize hook is unavailable
- logs warning (without swallowing cancellation) when reconciliation hook throws
- logs info when reconciliation closes one or more pending tool calls
- preserves cancellation semantics by re-raising `CancelledError` after best-effort reconciliation

This prevents lingering staged tool-call IDs after user stop/cancel races.

## Reused Stream Context Contract

`build_stream_context(...)` creates one per-query dict:

- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`

All pipeline sends reuse this same object via
`query_execution_pipeline_events.process_pipeline_event(...)` to reduce hot-path
allocations and keep context consistent across events. Completion backfill also
lives in `query_execution_pipeline_events.py`.

## Completion and Backfill State Machine

Execution tracks:

- `saw_terminal_event`
- `saw_text_chunk`
- `text_chunks`
- `last_assistant_full_text`

Loop gate semantics:

- once `saw_terminal_event=True`, later events in the same stream iteration are ignored and debug-logged
- `streaming-complete` marks terminal, resolves completion text, emits backfill completion path, and skips direct pipeline forwarding of the original event
- `error` marks terminal and is still forwarded once through `process_pipeline_event(...)`

Completed-turn memory writes are SDK-owned local side effects, not backend
post-terminal websocket events.

### Event extraction helpers

Helper parsing/completion logic is single-sourced in `query_event_extraction.py` and invoked
directly from `QueryExecutionService.execute(...)`.

- `extract_event_type` supports both dict and dataclass-like events
- `extract_event_type` trims type strings and treats whitespace-only values as missing
- `extract_non_empty_chunk_text` only accepts `content/streaming-response`
- `extract_assistant_full_text` only accepts `assistant-message-full`
- `resolve_completion_text` uses terminal/chunk/assistant/fallback precedence

### Completion text precedence (`resolve_completion_text`)

1. explicit `streaming-complete.final_response`
2. concatenated streamed chunk text
3. last assistant-full content
4. fallback constant: `I completed the requested action(s), but the model returned an empty final response.`

### Completion emission (`query_execution_pipeline_events.emit_completion_events`)

- emits synthetic `ChunkEvent` if no chunk was seen and completion text is non-empty
- always emits terminal `StreamingCompleteEvent`

If agent stream exits with no terminal event, service attempts the same fallback completion sequence.

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
- screenshot-ref and screenshot-refs[] load success paths
- missing artifact refs do not abort query execution
- `system_state_internal` application into agent runtime state
- cancelled query path logs active-task cancellation and pending tool-call reconciliation when history returns reconciled IDs

`tests/backend/test_query_execution_service_helpers.py` validates:

- screenshot ref trimming, blank-ref drop behavior, and single-ref fallback when `screenshot_refs` is blank-only
- per-ref artifact failure handling that preserves successful refs
- direct helper passthrough for event extraction primitives
- post-terminal backend events are ignored after `streaming-complete`

`tests/backend/test_query_execution_pipeline_events.py` validates:

- completion backfill ordering (`ChunkEvent` before `StreamingCompleteEvent`) and stream-context reuse in helper forwarding

`tests/backend/test_query_event_extraction.py` validates resolver precedence and empty-chunk fallback behavior.

## Drift Hotspots

1. changing completion precedence can regress frontend phase transitions.
2. removing synthetic chunk backfill can yield terminal completion with empty visible content.
3. replacing per-query shared context with per-event dicts increases allocation churn and may introduce metadata drift.
4. making screenshot-ref lookup fatal can block query handling on artifact outages.
5. skipping cancelled-turn pending tool-call reconciliation can leave staged IDs unresolved and break tool history continuity.
6. terminal-missing fallback path depends on `complete_query_stream(...)`; changing that helper without preserving backfill ordering can regress fallback completion.

## Related Pages

- [Backend API Services Docs Hub](README.md)
- [Query Execution Support Helper Module Boundary Reference](query_execution_support_helper_module_boundary_reference.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)
- [Query Handler and Query Execution Service Runtime Reference](../handlers/query_handler_and_query_execution_service_runtime_reference.md)
