---
summary: "Agent execution deep reference: executor component assembly, interaction-loop iteration policy, LLM stream handling, and tool-turn send/wait/process cleanup guarantees."
read_when:
  - When changing agent loop termination/tool-turn behavior or event emission order.
  - When debugging empty-final-response fallbacks, bundle wait races, or stale tool state leaks.
title: "Interaction Loop and Tool-Turn Orchestration Reference"
---

# Interaction Loop and Tool-Turn Orchestration Reference

## Canonical Modules

- `backend/src/agent/execution/executor.py`
- `backend/src/agent/execution/completion_side_effects.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/tools/orchestrator.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/sending/execution_envelope.py`
- `backend/src/agent/tools/sending/execution_lanes.py`
- `backend/src/agent/tools/processing/processor.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `tests/backend/test_interaction_loop.py`
- `tests/backend/test_tool_sender.py`
- `tests/backend/test_bundle_execution.py`
- `tests/backend/test_tool_result_orchestrator.py`

## Executor Composition (`AgentExecutor.__init__`)

`AgentExecutor` composes focused components and injects them into `InteractionLoop`:

- prompt/history coordinator: `ConversationContext`
- llm stream handler: `LLMStreamProcessor`
- event surface: `EventPresenter`
- tool pipeline:
  - preparation (`ToolPreparer`)
  - sending (`ToolSender`)
  - waiting/orchestrator (`ToolResultOrchestrator`)
  - processing (`ToolResultProcessor` via `ToolProcessingCoordinator`)

This structure centralizes orchestration in `executor.py` while preserving single-responsibility components.

## Per-Query Runtime Path (`AgentExecutor.process_query`)

1. format user message content via prompt builder
2. resolve/store raw user query text from the last `<user_query>` block (fallback to plain query string)
3. append user message to history
4. optional screenshot registration + OCR kickoff
5. iterate `InteractionLoop.run_loop()` and forward events
6. finalization block (even on client disconnect):
  - delegate completed-turn side effects to `completion_side_effects.py`
  - publish `InteractionCompleted`
  - no backend memory-store websocket event is emitted; SDK hosts own completed-turn local memory writes

### Auto-Compaction Integration

`AgentExecutor.process_query(...)` runs pre-query compaction evaluation before appending the new user message:

- reason: `auto-pre`
- includes `pending_user_content=final_content` in projected token estimate
- emits `context-compaction-started/completed/failed` events around the compaction attempt

`InteractionLoop.run_loop(...)` runs mid-loop compaction checks on iterations greater than `1`:

- reason: `auto-mid`
- emits the same compaction lifecycle event types before next prompt sampling

Both flows include strategy and token metrics in event payloads and continue the turn if compaction is skipped.

Important reliability behavior:

- memory/publish side effects run in `finally`
- generator closure (`GeneratorExit`) falls back to event-bus publish via session-tracked background task
- completed-turn publish + interaction-memory emission stays single-sourced in `publish_and_emit_completion_side_effects(...)`

## Interaction Loop State Machine

Main loop in `InteractionLoop.run_loop()`:

1. prompt/tool schemas retrieval
2. prompt metadata events on first iteration only
3. LLM response retrieval (stream or native tool-turn completion path)
4. parsed response conversion (`NormalizedLLMResponse` -> `ParsedResponse`)
  - conversion + history tool-call shaping + recoverable tool-call error parsing delegate to `tool_call_bridge.py`
5. branch:
  - no tool calls: finalize assistant response
  - tool calls: execute tool-turn path and continue

Error handling:

- rate limit -> deterministic user-facing message + history marker
- other LLM/tool failures -> error event + history marker

Transient provider retries happen before `InteractionLoop` receives a terminal
LLM error. `LLMStreamProcessor` may retry one provider sampling attempt when the
provider reports a retryable 5xx/transport failure before any model output is
visible. `InteractionLoop` does not replay the user query, user-message history
admission, or tool execution for these retries.

## Loop Continuation Semantics

`InteractionLoop` continues until one of these terminal conditions occurs:

- model returns a final answer without tool calls
- LLM stream emits an unrecoverable error
- tool execution path emits a fatal error

History size is reduced only by compaction; the loop is not stopped by a fixed step budget.

Turn-commit policy:

- final assistant turns commit only replay-safe text; if model text is empty, loop resolves the deterministic fallback first, emits it, then commits that fallback text
- assistant tool turns render the assistant `tool_calls` payload once, commit that
  row, then stage ids from the same rendered payload before execution so
  fallback ids and provider ids stay linkable to later tool outputs
- query cancellation does not synthesize assistant text; it only reconciles pending `role='tool'` rows for already-committed assistant tool-call turns
- unsupported assistant-only structured blocks (for example stray reasoning/thinking fragments from partial transcript state) are dropped at history-admission boundaries instead of being replayed back to providers

## Tool-Turn Lifecycle

### Send phase

`ToolOrchestrator.execute(...)`:

- delegates to `ToolSender.send_tools(...)`

`ToolSender` behavior:

- single resolved tool -> `ToolCallEvent`
- multi-tool bundle -> one `ToolBundleEvent`
- preparation errors -> synthetic failed result storage + `ToolCallEvent` then `ToolOutputEvent` (protocol order preserved)
- failed bundle preparation still leaves all parsed calls bundle-scoped so wait/process stays on the atomic-bundle path and history can reconcile every staged `tool_call_id`
- backend-executed tools and synthetic failures now both flow through one execution-envelope helper so call -> auxiliary transparency events -> output ordering stays consistent across lanes

Validated by:

- `tests/backend/test_tool_sender.py::test_send_tools_marks_failed_coordinate_resolution_as_non_executable`
- `tests/backend/test_tool_sender.py::test_send_tools_does_not_dispatch_bundle_when_preparation_fails`

### Wait phase

`ToolResultOrchestrator.execute_tools_from_response(...)`:

- requires `session_ref`; returns empty batch when absent
- bundle path uses one bundle future (`execute_bundle`)
- non-bundle path delegates every parsed call to `execute_single_tool`; calls
  missing `request_id` return that helper's invalid-tool-call failure result
  instead of opening an unmatchable local-runtime wait

Bundle waiting behavior:

- uses preexisting stored bundle result if available
- timeout returns synthetic failed results

Validated by:

- `tests/backend/test_tool_result_orchestrator.py`
- `tests/backend/test_bundle_execution.py`

### Process/cleanup phase

`ToolResultProcessor.process(...)`:

- bundle result path: format combined bundle message once and commit single history entry
- non-bundle path: transform each result and commit
- `finally` cleanup:
  - remove pending/future request ids from storage
  - remove resolved tool calls
  - run TTL cleanup safety pass

This prevents session-state leaks across turns.

## LLM Stream Handler Integration

`LLMStreamProcessor` provides:

- stream + non-stream completion handling
- chunk/full-response emission
- token count event emission
- prompt cache continuity diagnostics (`cold_start`, `append_only`, etc.)
- last normalized response payload capture for tool-call parsing bridge

## Empty Final Response Fallback

If no tool calls and final text is empty:

- loop synthesizes deterministic fallback response
- includes concise latest tool output summary when available
- strips `<system_context>` suffix from summary

If the OpenAI Responses stream ends without any final response payload and
without recoverable streamed output, the backend treats that as a provider
stream failure instead of a valid empty assistant answer. The websocket emits an
`error` message with `OpenAI Responses stream ended without final response
payload`; it must not backfill a synthetic assistant delta or persist an empty
assistant completion for that turn.

Validated by:

- `tests/backend/test_interaction_loop.py::test_interaction_loop_emits_fallback_when_final_response_empty_after_tool_output`
- `tests/backend/test_openai_provider.py::test_openai_responses_runtime_emits_error_for_empty_stream`
- `tests/backend/test_openai_provider.py::test_openai_responses_runtime_logs_terminal_event_without_response`
- `tests/backend/test_formatters.py::TestErrorEventFormatter::test_format_preserves_openai_responses_empty_stream_message`

## Drift Hotspots

1. Changing event order (`ToolCallEvent` vs `ToolOutputEvent`) can break SDK/local-runtime request/response state tracking.
2. Removing tool-result processing from `finally` reintroduces leaked request ids and stale resolved-call state.
3. Altering bundle detection/wait ordering can create race conditions where next iteration starts before bundle completion.
4. Changing parsed-tool-call metadata handling can orphan request IDs needed for result correlation.

## Related Docs

- [Native Tool-Call Bridge and History Mapping Reference](native_tool_call_bridge_and_history_mapping_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [History Compaction Engine Decision, Strategy, and Event Contract Reference](history_compaction_engine_decision_strategy_and_event_contract_reference.md)
