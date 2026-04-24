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
- `frontend/src/renderer/features/chat/utils/transcriptModelContext.ts`
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerMessages.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerResultPersistence.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/singleToolExecution.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/bundleExecution.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionResultDispatch.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionBundleRunner.ts`
- `frontend/src/renderer/infrastructure/services/toolExecution/ToolExecutionTypes.ts`
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
- wiring backend send relay and delegating tool/bundle result persistence to `toolRunnerResultPersistence.ts`

`ToolExecutionService` owns:

- service-level callback state and delegation into:
  - `singleToolExecution.ts`
  - `bundleExecution.ts`
- capture/upload/format integration
- normalized backend result envelope emission (`tool-result`, `tool-bundle-result`) via `ToolExecutionResultDispatch`

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
  - `mouse_control` actions `click`, `double_click`, `right_click` wait full ghost-click timeline (`3200ms`) before execution:
    - hold at current cursor for `1000ms`
    - move to target for `1200ms`
    - hold at target for `1000ms`
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
- the shared model metadata base lives in `transcriptModelContext.ts`, which is also consumed by chat-stream tool-output persistence helpers

## Single Tool Execution (`ToolExecutionService.executeTool`)

Ordered pipeline:

1. log start/timing context
2. invoke tool IPC via `invokeTool(...)`
3. run `ensureAutoCapture(...)`
4. upload screenshot artifact when computer-use tool + screenshot available
   hosted artifact uploads from the main-process local-backend bridge include the persisted install bearer token when present
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

Transcript persistence split:

- `toolRunnerMessages.ts` owns chat-row and transcript-metadata projection for frontend-executed tool results
- `toolRunnerResultPersistence.ts` owns append/store orchestration for single-tool, bundle, and surface-failure result paths
- transcript `tool-output` rows are written through `toolOutputTranscriptPersistence.ts`, which is shared with backend-stream `tool-output` handling so `structuredPayload.toolCallDetails` and screenshot/model metadata fields stay aligned

## Backend Envelope Shapes from Service

Single tool send:

- `type: "tool-result"`
- payload:
  - `request_id`
  - `success`
  - `data` (normalized object with `llm_content` and optional `screenshot_ref`/`capture_meta` plus optional `system_state` and `system_state_internal`)
  - `error`

Bundle send:

- `type: "tool-bundle-result"`
- payload:
  - `bundle_id`
  - `status`
  - `step_results` (`tool`, `status`, `output`)
  - `error` (nullable; `null` in non-failure paths)
  - optional `screenshot_ref`, `capture_meta`, and `system_state` (gated by include flags)

Envelope-build ownership:

- `ToolExecutionBackendPayload.ts` builds final backend envelopes
- `ToolExecutionPayloads.ts` provides normalized `data` shaping for single-tool payloads
- `ToolResultEnvelope.ts` is the canonical envelope-type + correlation-id resolver contract

## Test-Backed Invariants

`tests/frontend/ToolExecutionService.test.ts` verifies:

- computer-use auto-capture and artifact upload behavior
- non-computer tools skip screenshot/system-state payload fields
- result-provided screenshot/system_state are reused
- bundle fail-fast, partial/failure status mapping, and screenshot tool display-bounds forwarding

`tests/frontend/ToolExecutionBackendPayload.test.ts` verifies:

- `tool-result` envelope `llm_content` normalization path
- screenshot/system-state inclusion-gate behavior
- bundle envelope `error: null` success path and failure error propagation

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
