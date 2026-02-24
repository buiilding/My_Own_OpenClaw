---
summary: "Deep reference for QueryExecutionService helper contracts: event-type extraction compatibility, chunk/full-message/terminal text resolution, and synthetic completion emission behavior."
read_when:
  - When changing query-execution helper methods that parse stream events.
  - When debugging empty final responses, missing chunk aggregation, or dict-event compatibility regressions.
title: "Query Execution Helper Contracts and Compatibility Event Extraction Reference"
---

# Query Execution Helper Contracts and Compatibility Event Extraction Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_stream_pipeline.py`

## Helper Surface in Query Execution

`QueryExecutionService.execute(...)` relies on internal helpers to keep stream-loop logic compatible across event shapes:

- `_extract_event_type`
- `_extract_dict_payload`
- `_extract_dict_string_field`
- `_extract_chunk_text`
- `_extract_non_empty_chunk_text`
- `_extract_assistant_full_text`
- `_extract_streaming_complete_text`
- `_resolve_completion_text`
- `_emit_completion_events`

These helpers isolate parsing/compat logic from transport/tts orchestration.

## Event-Type Compatibility Contract

`_extract_event_type(event)` supports:

1. dict events with string `type`
2. object events with string `.type`
3. enum-backed `.type.value` strings

Any other shape returns `None`.

This allows mixed event producers during migrations without failing the stream loop.

## Dict Payload Field Resolution

`_extract_dict_string_field(...)` behavior:

- check top-level key first
- fallback to payload key inside object payload
- optional `payload_key` override

Used for:

- chunk/content extraction compatibility (`content` vs payload `text`)
- streaming complete final response extraction from legacy/new envelope shapes

## Chunk Aggregation Rules

Accepted chunk-like event types:

- `chunk`
- `content`
- `streaming-response`

`_extract_non_empty_chunk_text` only returns non-whitespace strings; empty/whitespace-only chunks are ignored for aggregation.

Aggregated text is used as one completion fallback source when explicit terminal text is absent.

## Assistant Full Message Fallback

`_extract_assistant_full_text` only reads events typed `assistant_message_full`.

If present, trimmed assistant full text is retained as secondary completion fallback after aggregated chunk text.

## Terminal Completion Resolution Order

`_resolve_completion_text(...)` precedence:

1. `streaming-complete.final_response`
2. aggregated chunk text (when any non-empty chunk seen)
3. last `assistant_message_full` text
4. constant fallback:
- `"I completed the requested action(s), but the model returned an empty final response."`

This ensures frontend receives deterministic terminal text even on malformed/incomplete streams.

## Synthetic Completion Emission Contract

`_emit_completion_events(...)` behavior:

- if no chunk has been seen and resolved completion text exists:
- emits synthetic `ChunkEvent(content=completion_text)` first
- then always emits `StreamingCompleteEvent(final_response=completion_text)`

Return value updates `saw_text_chunk` so caller state remains consistent.

## Stream-End Fallback Path

When stream iteration finishes without terminal event:

- service logs warning
- reuses same `_resolve_completion_text` + `_emit_completion_events` path

This keeps end-of-stream behavior uniform regardless of whether terminal event came from upstream model stream.

## TTS Ordering Coupling

After event loop (including synthetic fallback path):

- wait for pending TTS tasks (`pipeline.wait_for_pending_tts()`)
- flush TTS service

This prevents tail-audio truncation when completion events were synthesized late.

## Test Coverage Status

Current explicit tests cover `StreamPipeline` concurrency/error isolation (`tests/backend/test_stream_pipeline.py`).

There is no dedicated `QueryExecutionService` helper-level unit suite yet in repo. This is a residual risk for helper regressions in dict-event compatibility and completion fallback ordering.

## Drift Hotspots

1. narrowing accepted chunk event aliases can drop streamed text aggregation for legacy emitters.
2. changing helper precedence can produce empty or duplicated final responses.
3. removing synthetic chunk backfill can yield completion-only turns with no visible assistant text in some frontend paths.

## Related Pages

- [API Processing Completion Docs Hub](README.md)
- [Query Execution Runtime-State and Completion Resolver Reference](../query_execution_runtime_state_and_completion_resolver_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](../stream_pipeline_completion_and_tts_concurrency_reference.md)
