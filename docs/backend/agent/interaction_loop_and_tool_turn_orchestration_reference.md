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
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/agent/execution/policies.py`
- `backend/src/agent/llm/conversation_context.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/agent/llm/event_presenter.py`
- `backend/src/agent/tools/orchestrator.py`
- `backend/src/agent/tools/sending/sender.py`
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
  - publish `InteractionCompleted`
  - emit/publish `MemoryStoreEvent` fallback (uses resolved raw user query, not full enriched content envelope)

Important reliability behavior:

- memory/publish side effects run in `finally`
- generator closure (`GeneratorExit`) falls back to event-bus publish via session-tracked background task

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

## Iteration Policy Semantics

`IterationPolicy` fields:

- `max_iterations`
- `in_extra_turn_after_final_tools`

Behavior:

- loop may run one extra no-tool turn after final tool execution
- if tools are attempted in the extra turn, loop forces final answer path
- hard limit emits deterministic max-step failure

## Tool-Turn Lifecycle

### Send phase

`ToolOrchestrator.execute(...)`:

- emits `ThinkingEvent`
- delegates to `ToolSender.send_tools(...)`

`ToolSender` behavior:

- single resolved tool -> `ToolCallEvent`
- multi-tool bundle -> one `ToolBundleEvent`
- preparation errors -> synthetic failed result storage + `ToolCallEvent` then `ToolOutputEvent` (protocol order preserved)

Validated by:

- `tests/backend/test_tool_sender.py::test_send_tools_marks_failed_coordinate_resolution_as_non_executable`
- `tests/backend/test_tool_sender.py::test_send_tools_does_not_dispatch_bundle_when_preparation_fails`

### Wait phase

`ToolResultOrchestrator.execute_tools_from_response(...)`:

- requires `session_ref`; returns empty batch when absent
- bundle path uses one bundle future (`execute_bundle`)
- non-bundle path waits per request id (`execute_single_tool`)

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

Validated by:

- `tests/backend/test_interaction_loop.py::test_interaction_loop_emits_fallback_when_final_response_empty_after_tool_output`

## Drift Hotspots

1. Changing event order (`ToolCallEvent` vs `ToolOutputEvent`) can break frontend request/response state tracking.
2. Removing tool-result processing from `finally` reintroduces leaked request ids and stale resolved-call state.
3. Altering bundle detection/wait ordering can create race conditions where next iteration starts before bundle completion.
4. Changing parsed-tool-call metadata handling can orphan request IDs needed for result correlation.
