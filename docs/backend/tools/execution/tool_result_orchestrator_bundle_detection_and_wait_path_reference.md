---
summary: "Deep reference for tool execution wait orchestration: atomic bundle detection, session-required routing, single-vs-bundle future wait semantics, missing request_id failure behavior after pending placeholder removal, and stale-screen safety checks."
read_when:
  - When changing `ToolResultOrchestrator` routing or single/bundle wait helpers.
  - When debugging skipped tool calls, bundle-id/request-id metadata drift, or SDK-submitted tool-result timeout behavior.
  - When debugging a missing `request_id`, removed pending-local-runtime placeholder, or invalid tool-call failure result in the single-tool wait path.
title: "Tool Result Orchestrator Bundle Detection and Wait Path Reference"
---

# Tool Result Orchestrator Bundle Detection and Wait Path Reference

## Canonical Modules

- `backend/src/agent/tools/orchestrator.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/agent/tools/shared/bundle_detection.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `tests/backend/test_tool_result_orchestrator.py`
- `tests/backend/test_bundle_detection.py`
- `tests/backend/test_bundle_execution.py`

## Two-Phase Lifecycle

`ToolOrchestrator` splits execution into two explicit phases:

1. `execute(...)`: forward sender events (`ToolCallEvent` or `ToolBundleEvent`)
2. `process_results(...)`: call `ToolResultOrchestrator.execute_tools_from_response(...)`, then hand batch to processing coordinator

This keeps send-time streaming separate from wait-and-commit work.

## Session Requirement and Safe Empty Return

`ToolResultOrchestrator.execute_tools_from_response(...)` requires `session_ref`.

When missing:

- logs error
- returns `create_empty_tool_results()`

No fallback execution path exists without session state.

## Atomic Bundle Detection Rules

`is_atomic_bundle(parsed_response)` is true only when:

- more than one tool call
- every tool call metadata resolves to `ExecutionRef.kind == "bundle"`
- every tool call resolves to the same non-empty `bundle_id`

Any call with `request_id` in metadata, or any mix of unrelated `bundle_id`
values, fails bundle detection and routes to the single-tool path.

## Bundle Wait Path (`execute_bundle`)

For detected bundle responses:

1. read the shared `bundle_id` from first call metadata
2. create bundle future before checking existing stored result
3. if result already exists, set future immediately and continue
4. otherwise wait up to 120 seconds
5. always remove bundle future in `finally`
6. fan out bundle `step_results` to per-call `ToolExecutionResult` entries for compatibility

If `bundle_id` is missing, orchestrator logs error and returns empty result batch.

## Single Wait Path (`execute_single_tool`)

For each non-bundle call:

- delegates to `execute_single_tool(...)`; missing `request_id` returns that
  helper's invalid-tool-call failure result instead of opening a local-runtime
  wait
- create request future before reading pending result (race prevention)
- if pending result already exists, resolve immediately
- else wait up to 120 seconds
- always clean up future in `finally`

### Missing Request-ID Failure

The current single-tool wait path does not create the old
pending-local-runtime placeholder when a parsed tool call lacks
`metadata.request_id`.

Instead, `execute_single_tool(...)` returns an immediate failed `ToolResult`
with `data.status == "missing_request_id"` before any request future is
created. This is intentionally a backend correlation failure, not a local
runtime wait state: without `request_id`, no later SDK-submitted tool-result
payload can resolve the call.

### Stale-Screen Guard

When resolved-call metadata has `coordinate_resolution_screenshot_id`:

- compare against current session screenshot id
- mismatch returns immediate safety failure `ToolResult`
- no local-runtime wait is attempted

This prevents executing stale coordinates after UI state changes.

## Bundle Result Step Mapping Contract

`execute_bundle(...)` maps each parsed call by index to bundle `step_results`.

Per-step handling:

- `status == "ok"` -> success `ToolResult` with `bundle_result.data` preserved (screenshot/system_state propagation)
- otherwise -> failure `ToolResult` using step output, bundle error, or generic fallback

It supports dict and object-like step payloads via `_step_field(...)`.

## Test-Backed Invariants

`tests/backend/test_tool_result_orchestrator.py` verifies:

- missing session returns empty result batch
- bundle path with missing `bundle_id` returns empty batch
- single path preserves one result per parsed tool call, including an explicit
  failure result when `request_id` metadata is missing

`tests/backend/test_bundle_detection.py` verifies atomic-bundle rules around `bundle_id` and `request_id`.

`tests/backend/test_bundle_execution.py` verifies:

- existing bundle result short-circuits wait
- timeout path returns failure tool results
- pydantic-style step payloads are accepted

## Drift Hotspots

1. changing bundle detection semantics can route calls to wrong wait path.
2. removing create-future-before-read ordering can reintroduce result-arrival races.
3. changing bundle step index mapping can misattribute outputs to wrong tool calls.
4. removing stale-screen guard increases risk of unsafe UI automation actions.

## Related Pages

- [Backend Tools Execution Docs Hub](README.md)
- [Tool Sender Local-Runtime Dispatch and Synthetic Error Result Reference](tool_sender_local_runtime_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](../waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
