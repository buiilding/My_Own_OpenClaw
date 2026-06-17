---
summary: "Deep reference for QueryExecutionService helper contracts: event-type extraction, chunk/full-message/terminal text resolution, and synthetic completion emission behavior."
read_when:
  - When changing query-execution helper methods that parse stream events.
  - When debugging empty final responses, missing chunk aggregation, or dict-event extraction regressions.
title: "Query Execution Helper Contracts and Event Extraction Reference"
---

# Query Execution Helper Contracts and Event Extraction Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_stream_pipeline.py`
- `tests/backend/test_query_event_extraction.py`
- `tests/backend/test_query_execution_service_helpers.py`

## Helper Surface in Query Execution

`QueryExecutionService.execute(...)` relies on module-level helper functions in
`query_event_extraction.py` to keep stream-loop parsing rules explicit across
supported event shapes:

- `extract_event_type`
- `extract_dict_payload`
- `extract_dict_string_field`
- `extract_chunk_text`
- `extract_non_empty_chunk_text`
- `extract_assistant_full_text`
- `extract_streaming_complete_text`
- `resolve_completion_text`
- `query_execution_pipeline_events.emit_completion_events`

These helpers isolate parsing logic from transport/tts orchestration.

`QueryExecutionStreamState` (`query_execution_support/query_execution_stream_state.py`) owns mutable
per-turn aggregation/latch state and produces stable kwargs payloads consumed by
`resolve_completion_text(...)`.

## Event-Type Extraction Contract

`extract_event_type(event)` supports:

1. dict events with string `type`
2. object events with string `.type`
3. enum-backed `.type.value` strings

Any other shape returns `None`.
Whitespace-only type strings are normalized to `None` (trim + empty guard).
Extracted type values are otherwise case-preserving and case-sensitive.

This allows typed events and dict envelopes to share one extraction path without
failing the stream loop.

## Dict Payload Field Resolution

`extract_dict_string_field(...)` behavior:

- check top-level key first (non-empty/trimmed for top-level value)
- fallback to payload key inside object payload
- optional `payload_key` override
- when top-level field is accepted, return original top-level string value (not stripped)
- payload value acceptance only checks `isinstance(value, str)` and returns raw payload string

Used for:

- chunk/content field resolution (`content` vs payload `text`)
- streaming complete final response extraction from supported envelope shapes

## Chunk Aggregation Rules

Accepted chunk-like event types:

- `content`
- `streaming-response`

`extract_non_empty_chunk_text` only returns non-whitespace strings; empty/whitespace-only chunks are ignored for aggregation.

`extract_chunk_text(...)` source precedence:

- dict event: top-level `content` first, payload `text` fallback
- typed event: `.content` attribute only

Aggregated text is used as one completion fallback source when explicit terminal text is absent.

## Assistant Full Message Fallback

`extract_assistant_full_text` only reads events typed `assistant-message-full`.

If present, trimmed assistant full text is retained as secondary completion fallback after aggregated chunk text.

## Terminal Completion Resolution Order

`resolve_completion_text(...)` precedence:

1. `streaming-complete.final_response`
2. aggregated chunk text (when any non-empty chunk seen)
3. last `assistant-message-full` text
4. constant fallback:
- `"I completed the requested action(s), but the model returned an empty final response."`

If `saw_text_chunk=True` but joined chunk text is whitespace-only, resolver falls through to assistant-full text (or fallback), not blank completion text.

This ensures frontend receives deterministic terminal text even on malformed/incomplete streams.

Note: `resolve_completion_text` only uses chunk aggregation when `saw_text_chunk=True`. Non-empty-looking raw chunks that never pass `extract_non_empty_chunk_text` are intentionally excluded.

## Synthetic Completion Emission Contract

`query_execution_pipeline_events.emit_completion_events(...)` behavior:

- if no chunk has been seen and resolved completion text exists:
- emits synthetic `ChunkEvent(content=completion_text)` first
- then always emits `StreamingCompleteEvent(final_response=completion_text)`

Return value updates `saw_text_chunk` so caller state remains consistent.

## Stream-End Fallback Path

When stream iteration finishes without terminal event:

- service logs warning
- reuses the same completion-resolver + `emit_completion_events(...)` path

This keeps end-of-stream behavior uniform regardless of whether terminal event came from upstream model stream.

## TTS Ordering Coupling

After event loop (including synthetic fallback path):

- wait for pending TTS tasks (`pipeline.wait_for_pending_tts()`)
- flush TTS service

This prevents tail-audio truncation when completion events were synthesized late.

## Test Coverage Status

Current explicit tests cover:

- `StreamPipeline` concurrency/error isolation (`tests/backend/test_stream_pipeline.py`)
- query event helper extraction/completion precedence contracts (`tests/backend/test_query_event_extraction.py`)
- query-execution helper module behavior (`tests/backend/test_query_execution_service_helpers.py`)
- integration usage through API handler tests (`tests/backend/test_api_handlers.py`)

## Drift Hotspots

1. narrowing accepted chunk event types can drop streamed text aggregation for supported emitters.
2. changing helper precedence can produce empty or duplicated final responses.
3. removing synthetic chunk backfill can yield completion-only turns with no visible assistant text in some frontend paths.
4. desynchronizing stream-state helper shape (`completion_kwargs`) from resolver call signature can regress terminal fallback behavior.

## Related Pages

- [API Processing Completion Docs Hub](README.md)
- [Query Execution Runtime-State and Completion Resolver Reference](../query_execution_runtime_state_and_completion_resolver_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](../stream_pipeline_completion_and_tts_concurrency_reference.md)
