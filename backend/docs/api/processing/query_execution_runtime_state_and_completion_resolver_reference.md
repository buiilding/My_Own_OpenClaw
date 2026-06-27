---
summary: "Deep reference for QueryExecutionService internals: runtime system-state merge rules, multi-screenshot artifact resolution, stream context attachment, and completion-text resolver helpers."
read_when:
  - When changing `backend/src/api/services/query_execution_support/*` helper methods or completion fallback behavior.
  - When debugging missing screenshot artifacts (`screenshot_ref`/`screenshot_refs`), wrong stream context fields, or empty-final-response synthesis.
title: "Query Execution Runtime-State and Completion Resolver Reference"
---

# Query Execution Runtime-State and Completion Resolver Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/query_execution_support/query_execution_runtime.py`
- `backend/src/api/services/query_execution_support/query_execution_inputs.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
- `backend/src/api/schemas`
- `backend/src/services/artifacts/store.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/processing/pipeline.py`
- `tests/backend/test_query_execution_service_helpers.py`
- `tests/backend/test_query_event_extraction.py`

## Runtime System-State Seeding Rules

`query_execution_runtime.resolve_query_runtime_system_state(message)` only accepts
`system_state_internal` keys:

- `active_window`
- `mouse_position`
- `screen_resolution`

Filter behavior:

- value must be string
- string must be non-empty after trim
- unknown keys are dropped

`query_execution_runtime.apply_query_runtime_system_state(agent_instance, message)`:

1. fetch current session state via `get_current_system_state` when available
2. copy same allowed keys from existing state
3. overlay request state values
4. call `set_current_system_state` best-effort
5. swallow/log failures without aborting query stream

This state is backend-runtime-only context for tool preparation; it is not prompt content.

## Screenshot Resolution Boundary

`query_execution_runtime.resolve_screenshots(message, artifact_store_cls, session_manager_config)`
behavior:

- resolves refs from:
  - `payload.screenshot_refs[]` (preferred)
  - fallback `payload.screenshot_ref`
- returns normalized refs without loading artifact bytes

`query_execution_inputs.resolve_query_execution_inputs(...)` then maps screenshot inputs to:

- artifact-backed screenshot refs -> `image_refs`
- no screenshot input -> `image_refs` is `None`

Prompt construction later resolves refs into bounded model image payloads. Artifact lookup failure remains non-fatal and skips the unresolved image at prompt projection time.

## Agent Runtime Inputs

`query_execution_inputs.resolve_query_execution_inputs(...)` passes through the
required SDK/client-prepared `payload.content` as the model-facing user message.
Local memory snippets and attachment context are prepared before backend ingress,
not rebuilt from a backend query-context fallback.

`QueryExecutionService.execute(...)` forwards the normalized query inputs into
`AgentSession.process_query(...)`:

- `conversation_ref`
- `workspace_path`
- `repo_instruction_messages`
- `client_prompt_layers`
- `agent_definition`
- `runtime_system_state`

These inputs are session/runtime context, not display rows. Query handler tests use
dummy sessions with the full signature so drift in the backend-to-session contract
fails at the handler boundary.

## Stream Context Attachment Contract

`query_execution_runtime.build_stream_context(...)` creates immutable per-query dict:

- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`

Every pipeline event uses this same context object via
`query_execution_pipeline_events.process_pipeline_event(...)`.

`ResponseFormatter` then attaches context fields to outgoing envelopes.

## Event-Type Extraction Compatibility Helpers

`query_event_extraction.py` helpers support:

- dict events with string `type`
- typed events where `event.type` is string
- typed enum events via `event.type.value`

Dict payload helpers:

- `extract_dict_payload(...)` returns object payload only
- `extract_dict_string_field(...)` supports top-level key fallback to payload key

Chunk extraction:

- `TEXT_CHUNK_EVENT_TYPES = {"content", "streaming-response"}`
- rejects old plain-word or snake_case stream event aliases

## Completion Resolver Precedence

`query_event_extraction.resolve_completion_text(...)` order:

1. streaming-complete event `final_response`
2. concatenated non-empty streamed chunk text
3. `assistant-message-full` content
4. constant fallback message:
   - `"I completed the requested action(s), but the model returned an empty final response."`

`query_execution_pipeline_events.emit_completion_events(...)` behavior:

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

1. verify `build_stream_context(...)` values are non-empty
2. verify events pass through `pipeline.process(..., context=stream_context)`
3. verify formatter produced a message and did not return `None`

If completion text is empty despite chunk output:

1. verify chunk event type is in `TEXT_CHUNK_EVENT_TYPES`
2. verify chunk payload text is non-whitespace
3. verify `saw_text_chunk` flag transitions before completion handling

## Test-Backed Notes

`tests/backend/test_query_execution_service_helpers.py` covers:

- runtime-state filtering/merge rules
- screenshot ref trimming, fallback, and partial-failure behavior
- completion helper backfill ordering and context passthrough

`tests/backend/test_query_event_extraction.py` covers resolver precedence and assistant fallback
behavior when seen chunks are empty.

## Related Pages

- [API Processing Completion Docs Hub](completion/README.md)
- [Query Execution Helper Contracts and Event Extraction Reference](completion/query_execution_helper_contracts_and_event_extraction_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](stream_pipeline_completion_and_tts_concurrency_reference.md)
