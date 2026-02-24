---
summary: "Renderer tool execution runtime reference: `useToolRunner` event gating/correlation tracking, `ToolExecutionService` single-tool and bundle orchestration, callback ordering, and backend relay contracts."
read_when:
  - When changing `useToolRunner` behavior for turn gating, callback wiring, or backend send policy.
  - When changing `ToolExecutionService` execution ordering, fail-fast semantics, or bundle status/error mapping.
title: "Tool Execution Service and Hook Runtime Reference"
---

# Tool Execution Service and Hook Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerMessages.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionBundleRunner.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionTypes.ts`
- `tests/frontend/ToolExecutionService.test.ts`
- `tests/frontend/ToolExecutionBundleRunner.test.ts`
- `tests/frontend/ToolRunnerHook.events.test.ts`
- `tests/frontend/ToolRunnerHook.callbacks.test.ts`
- `tests/frontend/ToolRunnerMessages.test.ts`

## Runtime Ownership Boundary

`useToolRunner` owns:

- backend event subscription (`from-backend`)
- turn-level stale-event filtering
- execution correlation tracking
- wiring UI callbacks + transcript recording + backend send relay

`ToolExecutionService` owns:

- single-tool and bundle execution pipelines
- capture/upload/format integration
- normalized backend result envelope emission (`tool-result`, `tool-bundle-result`)

## `useToolRunner` Event Gate and Correlation Model

Tool ingress events:

- `tool-call`
- `tool-bundle`

Turn guardrails:

- tool events with `turn_ref` not matching active stream turn are treated as stale
- tool events for terminal phases (`idle`, `complete`, `error`) are ignored
- stale events emit explicit cancellation payloads:
  - single tool: `tool-result` with `frontend_stale_turn_cancelled`
  - bundle: `tool-bundle-result` with `frontend_stale_turn_cancelled`
- click-action sync gate:
  - `mouse_control` actions `click`, `double_click`, `right_click` wait `1900ms` before execution
  - after wait, stale-turn guard re-check runs before invoking sidecar tool
  - if stale after wait, runner emits cancellation payload instead of executing click

Correlation tracking:

- `trackedExecutionTurnsRef` maps correlation id -> turn ref
- entries are pruned when turn changes or reaches terminal phase
- callback outputs are ignored when correlation id no longer tracked
- backend send callback untracks correlation id after relay

Correlation id source order:

1. `payload.correlation_id`
2. `payload.request_id`
3. event id
4. generated UUID fallback

## Service Callback Wiring Contract

`ToolExecutionService` callbacks injected by `useToolRunner`:

- `onToolResult`: append assistant `tool-output` chat row + transcript tool-output row
- `onBundleResult`: append bundled output row + transcript tool-output row
- `sendToBackend`: relay tool payload to backend IPC channel

Both UI callbacks are suppressed for untracked/late correlations.

Model metadata capture:

- hook keeps latest `{modelId, modelProvider}` in mutable ref
- callback metadata uses latest values without recreating service instance

## Single Tool Execution (`ToolExecutionService.executeTool`)

Ordered pipeline:

1. log start/timing context
2. invoke tool IPC via `invokeTool(...)`
3. run `ensureAutoCapture(...)`
4. upload screenshot artifact when computer-use tool + screenshot available
5. resolve final system state
6. format `formattedMessage` (`formatToolOutputMessage`)
7. emit UI callback (`onToolResult`)
8. send backend payload (`tool-result`)
9. compute total execution time including backend send path
10. log timing breakdown

Error path:

- emits formatted failure tool-result to UI
- still sends failure `tool-result` payload to backend
- rethrows error to caller (hook catches/logs)

## Bundle Execution (`ToolExecutionService.executeToolBundle`)

`runToolBundle(...)` behavior:

- executes tools sequentially
- fail-fast on first failed result or thrown error
- for computer-use steps, captures screenshot after step
- captures system state only on final computer-use step

Bundle completion path:

1. derive bundle status from step results
2. normalize step results for formatter/UI
3. format combined message (`formatBundledToolOutputMessage`)
4. upload bundle screenshot artifact if present
5. emit UI callback (`onBundleResult`)
6. send single atomic backend envelope (`tool-bundle-result`)
7. compute total bundle time including backend send

Bundle status mapping:

- `success`: all executed steps succeeded
- `partial_failure`: an error occurred before all bundle steps executed
- `failure`: all steps executed but at least one failed

Failure message behavior:

- backend `error` field only populated for `failure` status

## Tool/Bundle Message Mapping in Renderer

`toolRunnerMessages.ts` contracts:

- `buildToolOutputMessage` maps service result to assistant `tool-output` row
- `buildBundleOutputMessage` includes bundled metadata:
  - `bundled: true`
  - `tool_count`
  - per-tool `{tool_name, success, error}`
- transcript metadata always includes:
  - `messageType: tool-output`
  - `toolName`
  - `correlationId`
  - model id/provider snapshot

## Backend Envelope Shapes from Service

Single tool send:

- `type: "tool-result"`
- payload:
  - `request_id`
  - `success`
  - `data` (normalized object with `llm_content` and optional system/screenshot refs)
  - `error`

Bundle send:

- `type: "tool-bundle-result"`
- payload:
  - `bundle_id`
  - `status`
  - `step_results` (`tool`, `status`, `output`)
  - optional `error`
  - optional `screenshot_ref` and `system_state`

## Test-Backed Invariants

`tests/frontend/ToolExecutionService.test.ts` verifies:

- computer-use auto-capture and artifact upload behavior
- non-computer tools skip screenshot/system-state payload fields
- result-provided screenshot/system_state are reused
- bundle fail-fast, partial/failure status mapping, and screenshot tool display-bounds forwarding

`tests/frontend/ToolExecutionBundleRunner.test.ts` verifies:

- sequential execution ordering
- fail-fast stop on error
- fallback output text rules for missing outputs/errors
- capture behavior for computer-use steps and final-state semantics

`tests/frontend/ToolRunnerHook.events.test.ts` and `callbacks.test.ts` verify:

- backend event subscription lifecycle
- stale-turn cancellation payload emission
- correlation-based dropping of late callbacks/results
- callback wiring to chat store, transcript writer, and backend relay

## Drift Hotspots

1. Changing callback order (UI emit vs backend send) can break transcript/message ordering assumptions.
2. Relaxing stale-turn guard logic allows old tool outputs to land in new conversations.
3. Modifying bundle status mapping can desync backend expectations for retry/failure handling.
4. Omitting untrack on backend send can leak correlation entries and wrongly admit future stale callbacks.
