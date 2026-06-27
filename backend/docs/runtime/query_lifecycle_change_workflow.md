---
summary: "Workflow for backend query lifecycle changes from websocket query ingress through session selection, stream pipeline, completion, cancellation, TTS, and SDK/renderer event consumers."
read_when:
  - When changing backend query handling, stream completion, cancellation, active-query limits, TTS session behavior, or terminal event policy.
  - When debugging missing completion events, duplicate chunks, stop-query failures, wrong conversation routing, or empty final responses.
  - When deciding whether a query bug belongs in the API handler, query execution service, agent loop, formatter pipeline, or SDK/renderer stream consumer.
title: "Query Lifecycle Change Workflow"
---

# Query Lifecycle Change Workflow

Use this workflow before changing backend query execution. Query lifecycle bugs cross several layers, so pick the owner before editing.

The query path is:

1. websocket message parse and typed handler dispatch
2. `QueryMessageHandler` active-task registration and capacity gate
3. `QueryExecutionService` query input resolution and stream context setup
4. `AgentSession.process_query(...)`
5. `InteractionLoop.run_loop()`
6. `StreamPipeline` formatter/transport/TTS send path
7. SDK stream projection, renderer consumer, and transcript persistence

Fix the producer first. For example, if the backend emits a malformed terminal event and the renderer hangs, fix backend event production or formatting before adding renderer-only defensive behavior.

## Fast Owner Map

| Symptom or request | First owner | Source roots | Start docs | Tests |
| --- | --- | --- | --- | --- |
| query is rejected before the model runs | websocket route, schema, or query handler | `backend/src/api/routes/websocket`, `backend/src/api/schemas`, `backend/src/api/handlers/query.py` | [API WebSocket Docs Hub](../api/websocket/README.md), [Query Handler and Query Execution Service Runtime Reference](../api/handlers/query_handler_and_query_execution_service_runtime_reference.md) | `tests/backend/test_websocket_message_handler.py`, `tests/backend/test_query_execution_inputs.py` |
| active query cap or stop-query behavior is wrong | query handler and session active-query tracker | `backend/src/api/handlers/query.py`, `backend/src/agent/session/active_query_tracker.py`, `backend/src/agent/session/manager.py` | [Non-Query Handler and Control Flow Reference](../api/non_query_handler_and_control_flow_reference.md), [Session Runtime and Config Rewire Reference](../agent/session_runtime_and_config_rewire_reference.md) | `tests/backend/test_active_query_tracker.py`, `tests/backend/test_query_execution_cancellation.py` |
| wrong conversation or workspace is used | session manager and query input resolver | `backend/src/agent/session`, `backend/src/api/services/query_execution_support/query_execution_inputs.py` | [Sessions and Conversations](../../concepts/sessions_and_conversations.md), [Conversation History and Prompt Context Runtime Reference](conversation_history_and_prompt_context_runtime_reference.md) | `tests/backend/test_session_manager.py`, `tests/backend/test_query_execution_inputs.py` |
| screenshots, artifacts, or runtime state are missing in the query | query input resolver and stream runtime context | `backend/src/api/services/query_execution_support/query_execution_inputs.py`, `backend/src/api/services/query_execution_support/query_execution_runtime.py` | [Query Execution Runtime-State and Completion Resolver Reference](../api/processing/query_execution_runtime_state_and_completion_resolver_reference.md) | `tests/backend/test_query_execution_inputs.py`, `tests/backend/test_query_execution_service_helpers.py` |
| chunks stream but no terminal completion arrives | stream pipeline and completion helper | `backend/src/api/services/query_execution.py`, `backend/src/api/services/query_execution_support/query_execution_completion.py`, `backend/src/api/processing/pipeline.py` | [Query Execution and Stream Pipeline Reference](query_execution_and_stream_pipeline_reference.md), [Stream Pipeline, Completion, and TTS Concurrency Reference](../api/processing/stream_pipeline_completion_and_tts_concurrency_reference.md) | `tests/backend/test_stream_pipeline.py`, `tests/backend/test_query_execution_stream_state.py` |
| final response is empty after tool use | interaction loop fallback and query completion backfill | `backend/src/agent/execution/interaction_loop.py`, `backend/src/api/services/query_execution_support/query_execution_completion.py` | [Interaction Loop and Tool-Turn Orchestration Reference](../agent/interaction_loop_and_tool_turn_orchestration_reference.md) | `tests/backend/test_interaction_loop.py`, `tests/backend/test_query_execution_stream_state.py` |
| provider stream event shape changes | LLM stream processor and formatter contract | `backend/src/agent/llm/llm_stream_processor.py`, `backend/src/api/processing/formatters`, `backend/src/api/contracts` | [LLM Stream Processor Token Count and Cache Diagnostics Reference](../agent/llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md), [Formatter Validation and Contract-Test Matrix Reference](../api/processing/formatters/formatter_validation_and_contract_test_matrix_reference.md) | `tests/backend/test_llm_stream_processor.py`, `tests/backend/test_llm_provider_stream_event_pipeline.py` |
| TTS audio misses final chunks or outlives a query | TTS session and stream pipeline pending-task barrier | `backend/src/api/services/tts_session.py`, `backend/src/api/processing/tts`, `backend/src/api/processing/pipeline.py` | [TTS Manager Audio Stream and Cleanup Reference](../api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md) | `tests/backend/test_tts_session.py`, `tests/backend/test_stream_pipeline.py` |
| renderer sees duplicate, stale, or wrong-turn stream rows | backend context envelope and SDK/renderer stream consumption | `backend/src/api/processing/formatter.py`, `backend/src/api/transport`, `frontend/src/renderer/features/chat` | [WebSocket Event Reference](../../reference/websocket_event_reference.md), [Frontend Stream State Machine](../../frontend/runtime/stream_event_state_machine.md) | backend formatter tests plus focused SDK/renderer stream tests |

## Ownership Rules

- Websocket route modules own connection lifecycle, incoming JSON parsing, task scheduling, and handler dispatch.
- `QueryMessageHandler` owns per-message capacity checks, active task registration, and top-level error mapping.
- `QueryExecutionService` owns per-turn query input resolution, stream context, TTS session setup, completion fallback, and cancellation reconciliation.
- `AgentSession` owns session-scoped history, runtime state, prompt context, tool result storage, and executor wiring.
- `InteractionLoop` owns prompt sampling, LLM response parsing, tool/no-tool branching, loop continuation, and final assistant history commit.
- `StreamPipeline` owns event formatting, websocket transport send, and asynchronous TTS side effects.
- The renderer owns presentation and stale-turn filtering; it should not compensate for a backend producer that violates event contracts.

## Change Sequence

1. Identify the failing lifecycle stage from the fast owner map.
2. Read the owner deep reference and the adjacent consumer reference.
3. Inspect the owner source and focused tests before editing.
4. Keep query identity fields intact: `user_id`, `session_id`, `conversation_ref`, `turn_ref`.
5. Preserve terminal event behavior unless the change intentionally updates the contract.
6. Add or update producer tests first, then consumer tests if the outgoing contract changes.
7. Update [WebSocket Event Reference](../../reference/websocket_event_reference.md) or renderer stream docs when event shape or ordering changes.
8. Run the narrowest backend tests plus frontend tests when renderer event consumption is affected.

## Invariants

Query lifecycle changes must preserve these invariants:

- Each accepted query is registered as an active query task before execution starts.
- Active-query capacity checks and active-task registration happen in one
  session-manager tracker operation so concurrent admissions cannot all observe
  the same pre-registration count.
- Active query task registration is cleared in a `finally` path.
- Stop requests can cancel an already registered task or be consumed by a query that starts shortly after the stop request.
- `QueryExecutionService` validates query text before entering the agent loop.
- A query stream should emit a terminal completion or error path even when the model stream exits without a terminal event.
- Post-terminal events are ignored by `QueryExecutionService`.
- Completion text precedence is deterministic: terminal final response, chunk accumulation, assistant full text, then fallback.
- TTS work cannot block or corrupt text transport.
- Cancellation reconciles already staged tool calls with synthetic tool outputs but does not synthesize assistant text.
- Context envelope fields should be attached uniformly to outgoing events.

## API Handler Changes

Change `backend/src/api/handlers/query.py` when the request touches:

- query capacity gates.
- active task registration.
- top-level validation error mapping.
- dependency injection for query execution service collaborators.
- per-message handler behavior before `QueryExecutionService.execute(...)`.

Do not put stream formatting, tool waiting, or LLM parsing in the handler. Keep the handler a thin bridge from typed websocket messages to the service layer.

Validation:

- `tests/backend/test_websocket_message_handler.py`
- `tests/backend/test_query_execution_inputs.py`
- `tests/backend/test_active_query_tracker.py`

## Query Execution Service Changes

Change `backend/src/api/services/query_execution.py` and `backend/src/api/services/query_execution_support/*` when the request touches:

- screenshot or artifact payload resolution.
- runtime `system_state_internal` merge behavior.
- stream context fields.
- completion fallback and backfill.
- post-terminal event policy.
- cancellation reconciliation for pending tool calls.
- TTS session lifecycle around a query.

Do not add provider-specific stream parsing here; that belongs under LLM provider or stream processor code.

Validation:

- `tests/backend/test_query_execution_inputs.py`
- `tests/backend/test_query_execution_service_helpers.py`
- `tests/backend/test_query_execution_stream_state.py`
- `tests/backend/test_query_execution_pipeline_events.py`
- `tests/backend/test_query_execution_cancellation.py`

## Agent Session and Interaction Loop Changes

Change `backend/src/agent/session/*` when the request touches:

- session creation or lookup.
- conversation ref normalization.
- config rewire and prompt context propagation.
- active query bookkeeping.
- history or runtime-state containers.

Change `backend/src/agent/execution/*` when the request touches:

- LLM/tool iteration order.
- final answer vs tool-call branching.
- assistant history commit.
- max/stop loop policy.
- compaction events inside the loop.
- recoverable LLM tool-call errors.

Validation:

- `tests/backend/test_session_manager.py`
- `tests/backend/test_session_registry.py`
- `tests/backend/test_session_config_service.py`
- `tests/backend/test_interaction_loop.py`
- `tests/backend/test_agent_executor_completion_side_effects.py`

## Stream Pipeline and Formatter Changes

Change `backend/src/api/processing/*` and `backend/src/api/contracts/*` when the request touches:

- event class to formatter dispatch.
- outgoing websocket schema.
- context envelope fields.
- completion/chunk event formatting.
- TTS concurrency around text chunks.
- terminal event gating.

Validation:

- `tests/backend/test_stream_pipeline.py`
- `tests/backend/test_query_event_extraction.py`
- `tests/backend/test_llm_provider_stream_event_pipeline.py`
- formatter contract tests under `tests/backend`
- SDK/renderer stream consumer tests when event order or shape changes.

## Frontend Consumer Check

Run frontend checks when a backend change affects:

- event type strings.
- `turn_ref` or `conversation_ref` shape.
- terminal event ordering.
- tool-call or tool-output payload shape.
- token-count or prompt-transparency event timing.
- websocket close/error semantics.

Start frontend docs:

- [Frontend Stream State Machine](../../frontend/runtime/stream_event_state_machine.md)
- [Frontend Chat Stream and Tool Execution Reference](../../frontend/renderer/chat_stream_and_tool_execution_reference.md)
- [Streaming and Events](../../concepts/streaming_and_events.md)

## Review Checklist

- The change names the lifecycle stage it owns.
- The producer event contract is tested before consumer fallback behavior is added.
- Query identity fields still flow through the handler, service, formatter, and renderer.
- Completion fallback behavior is deterministic and covered.
- Cancellation behavior is covered for active task and pending-stop races.
- TTS failures remain isolated from text streaming.
- Docs and changelog mention any stream, cancellation, or terminal event contract change.

## Related Docs

- [Backend Runtime Docs Hub](README.md)
- [Query Execution and Stream Pipeline Reference](query_execution_and_stream_pipeline_reference.md)
- [Backend Agent Docs Hub](../agent/README.md)
- [Tool Turn Change Workflow](../agent/tool_turn_change_workflow.md)
- [WebSocket Event Reference](../../reference/websocket_event_reference.md)
- [Test Selection](../../debug/test_selection.md)
