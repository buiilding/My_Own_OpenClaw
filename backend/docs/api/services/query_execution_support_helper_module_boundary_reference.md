---
summary: "Deep reference for `query_execution_support/*` helper modules used by `QueryExecutionService`: screenshot/runtime-state normalization, stream-state tracking, pipeline-event forwarding, completion backfill, and cancellation reconciliation boundaries."
read_when:
  - When changing helper ownership between `query_execution.py`, `query_event_extraction.py`, and `query_execution_support/*`.
  - When debugging query-stream fallback behavior, screenshot-ref normalization, or cancelled-turn pending tool-call reconciliation.
title: "Query Execution Support Helper Module Boundary Reference"
---

# Query Execution Support Helper Module Boundary Reference

## Canonical Modules

- `backend/src/api/services/query_execution.py`
- `backend/src/api/services/query_event_extraction.py`
- `backend/src/api/services/query_execution_support/query_execution_runtime.py`
- `backend/src/api/services/query_execution_support/query_execution_inputs.py`
- `backend/src/api/services/query_execution_support/query_execution_pipeline_events.py`
- `backend/src/api/services/query_execution_support/query_execution_stream_state.py`
- `backend/src/api/services/query_execution_support/query_execution_cancellation.py`
- `tests/backend/test_query_execution_service_helpers.py`
- `tests/backend/test_query_event_extraction.py`

## Ownership Split

`QueryExecutionService.execute(...)` is orchestration-only:

- query/session lifecycle
- TTSSession scope and stream loop
- event terminal gating

It delegates helper responsibilities into focused modules:

- `query_event_extraction.py`
- `query_execution_support/*`

## `query_event_extraction.py` Contract

Helper functions imported and called directly by `query_execution.py`:

- `extract_event_type`
- `extract_non_empty_chunk_text`
- `extract_assistant_full_text`
- `resolve_completion_text`

Current service shape no longer keeps class-level compatibility wrappers for those extraction
helpers; call sites use module-level functions directly.

## `query_execution_runtime.py` Contract

Runtime helper ownership:

- screenshot resolution (`resolve_screenshots`)
- screenshot ref normalization (`resolve_screenshot_refs`)
- capture metadata normalization (`resolve_query_screenshot_metadata`)
- backend runtime state extraction/merge (`resolve_query_runtime_system_state`, `apply_query_runtime_system_state`)
- stream-context assembly (`build_stream_context`)

Notable behavior:

- `screenshot_refs` entries are trimmed and blank refs are dropped
- when `screenshot_refs` has no usable refs, fallback `screenshot_ref` is used
- artifact refs are not hydrated during query input shaping

## `query_execution_inputs.py` Contract

`resolve_query_execution_inputs(...)` constructs one immutable dataclass payload:

- `image_refs`: normalized artifact refs `list[str] | None`
- `capture_meta`: dict copy or `None`
- `message_content`: required payload `content` from the SDK/client-prepared
  model-facing query content
- `conversation_ref`: pass-through from payload conversation ref

Artifact-backed `screenshot_ref`/`screenshot_refs` are stored as refs and
resolved later by prompt construction. The module does not keep a separate
helper that collapses artifact screenshot lists back into `image_data`.

## `query_execution_stream_state.py` Contract

`QueryExecutionStreamState` is mutable-per-turn execution state:

- terminal latch: `saw_terminal_event`
- chunk-tracking: `saw_text_chunk`, `text_chunks`
- assistant fallback text: `last_assistant_full_text`

`completion_kwargs(...)` returns a stable kwargs dict shape consumed by
`resolve_completion_text(...)`.

## `query_execution_pipeline_events.py` Contract

Pipeline forwarding helpers:

- `process_pipeline_event(...)`: one event passthrough with shared context object
- `emit_completion_events(...)`: optional synthetic `ChunkEvent` backfill then terminal
  `StreamingCompleteEvent`

Backfill is conditional:

- emitted only when no chunk was previously observed and completion text is non-empty

## `query_execution_cancellation.py` Contract

`finalize_pending_tool_calls_on_cancel(...)` is best-effort reconciliation:

- dynamic lookup of `history.finalize_pending_tool_calls_as_cancelled`
- warning logs on reconciliation failure with user/session/turn/conversation metadata
- info log only when reconciled count is positive
- no exception propagation (cancellation semantics stay owned by caller)

## Service Wrapper Surface

`QueryExecutionService` does not keep thin wrappers for support-module helpers.
Call sites use `build_stream_context(...)`,
`finalize_pending_tool_calls_on_cancel(...)`, `process_pipeline_event(...)`, and
`complete_query_stream(...)` directly.

## Drift Hotspots

1. Reintroducing extraction-helper wrappers in service class can fork behavior from
   `query_event_extraction.py`.
2. Changing screenshot ref trimming/fallback order can break single-ref payloads.
3. Bypassing `QueryExecutionStreamState.completion_kwargs(...)` can desync resolver call shape
   and fallback behavior.
4. Moving cancellation reconciliation out of helper without equivalent log/context fields reduces
   cancelled-turn diagnostics.
5. Letting post-terminal events through `QueryExecutionService.execute(...)` can
   silently break completed-turn memory persistence and duplicate terminal sends.

## Related Docs

- [Query Execution Service Stream Context and Completion Fallback Reference](query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Query Handler and Query Execution Service Runtime Reference](../handlers/query_handler_and_query_execution_service_runtime_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](../processing/query_execution_runtime_state_and_completion_resolver_reference.md)
- [Query Execution Helper Contracts and Event Extraction Reference](../processing/completion/query_execution_helper_contracts_and_event_extraction_reference.md)
