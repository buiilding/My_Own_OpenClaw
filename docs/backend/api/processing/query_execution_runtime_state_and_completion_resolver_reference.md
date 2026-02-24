---
summary: "Deep reference for QueryExecutionService internals: runtime system-state merge rules, screenshot artifact resolution, stream context attachment, and completion-text resolver helpers."
read_when:
  - When changing `backend/src/api/services/query_execution.py` helper methods or completion fallback behavior.
  - When debugging missing screenshot artifacts, wrong stream context fields, or empty-final-response synthesis.
title: "Query Execution Runtime-State and Completion Resolver Reference"
---

# Query Execution Runtime-State and Completion Resolver Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/schema.py`
- `backend/src/services/artifacts.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/processing/pipeline.py`

## Runtime System-State Seeding Rules

`_resolve_query_runtime_system_state(message)` only accepts `system_state_internal` keys:

- `active_window`
- `mouse_position`
- `screen_resolution`

Filter behavior:

- value must be string
- string must be non-empty after trim
- unknown keys are dropped

`_apply_query_runtime_system_state(agent_instance, message)`:

1. fetch current session state via `get_current_system_state` when available
2. copy same allowed keys from existing state
3. overlay request state values
4. call `set_current_system_state` best-effort
5. swallow/log failures without aborting query stream

This state is backend-runtime-only context for tool preparation; it is not prompt content.

## Screenshot Resolution Boundary

`_resolve_screenshot(message, artifact_store_cls)` behavior:

- returns inline `payload.screenshot` when present
- if no inline screenshot and `screenshot_ref` exists:
  - build store via `ArtifactStore.from_config(...)`
  - load base64 with `store.load_base64(screenshot_ref)`
- artifact load failure logs warning and returns `None`

Failure is non-fatal; query continues without screenshot payload.

## Stream Context Attachment Contract

`_build_stream_context(...)` creates immutable per-query dict:

- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`

Every pipeline event uses this same context object via `_process_pipeline_event(...)`.

`ResponseFormatter` then attaches context fields to outgoing envelopes.

## Event-Type Extraction Compatibility Helpers

`_extract_event_type(event)` supports:

- dict events with string `type`
- typed events where `event.type` is string
- typed enum events via `event.type.value`

Dict payload helpers:

- `_extract_dict_payload(...)` returns object payload only
- `_extract_dict_string_field(...)` supports top-level key fallback to payload key

Chunk extraction compatibility:

- `_TEXT_CHUNK_EVENT_TYPES = {"chunk", "content", "streaming-response"}`
- permits legacy and normalized stream event aliases

## Completion Resolver Precedence

`_resolve_completion_text(...)` order:

1. streaming-complete event `final_response`
2. concatenated non-empty streamed chunk text
3. `assistant_message_full` content
4. constant fallback message:
   - `"I completed the requested action(s), but the model returned an empty final response."`

`_emit_completion_events(...)` behavior:

- when no chunk was observed and completion text exists:
  - emits synthetic `ChunkEvent(content=completion_text)` first
- always emits `StreamingCompleteEvent(final_response=completion_text)`
- returns updated `saw_text_chunk` flag

## Terminal Event Safety

Runtime flags:

- `saw_terminal_event`
- `saw_text_chunk`

If stream ends without terminal event:

- warning log emitted
- resolver path still synthesizes completion events

If TTS enabled after event loop:

1. await pending TTS tasks
2. flush TTS service

This ordering prevents tail-audio truncation.

## Debug Checklist

If tool execution uses stale active-window info:

1. inspect inbound `system_state_internal` payload keys and value types
2. verify setter/getter methods exist on `AgentSession`
3. inspect merge order (incoming values should override existing key values)

If streamed events lack context fields:

1. verify `_build_stream_context(...)` values are non-empty
2. verify events pass through `pipeline.process(..., context=stream_context)`
3. verify formatter produced a message and did not return `None`

If completion text is empty despite chunk output:

1. verify chunk event type is in `_TEXT_CHUNK_EVENT_TYPES`
2. verify chunk payload text is non-whitespace
3. verify `saw_text_chunk` flag transitions before completion handling
