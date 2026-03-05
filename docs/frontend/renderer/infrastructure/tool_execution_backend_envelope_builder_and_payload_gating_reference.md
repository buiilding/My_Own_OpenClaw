---
summary: "Deep reference for renderer tool-result and tool-bundle-result envelope builders: payload-data normalization handoff, inclusion gates, correlation-id mapping, and backend contract alignment."
read_when:
  - When changing `ToolExecutionBackendPayload.ts`, `ToolExecutionPayloads.ts`, or `ToolResultEnvelope.ts` backend relay shapes.
  - When debugging missing `screenshot_ref`/`capture_meta`/`system_state` fields or correlation-id mismatches in backend tool-result ingestion.
title: "Tool Execution Backend Envelope Builder and Payload-Gating Reference"
---

# Tool Execution Backend Envelope Builder and Payload-Gating Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/ToolExecutionBackendPayload.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/ToolResultEnvelope.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `tests/frontend/ToolExecutionBackendPayload.test.ts`
- `tests/frontend/ToolExecutionPayloads.test.ts`
- `tests/frontend/ToolExecutionService.test.ts`

## Ownership Boundary

`ToolExecutionBackendPayload.ts` owns final outbound envelope assembly only.

It does not:

- perform tool execution
- run capture
- upload artifacts
- format UI-facing messages

It does:

- call `buildToolResultPayloadData(...)` for normalized data shaping
- wrap normalized payloads through `buildToolResultEnvelope(...)` / `buildToolBundleResultEnvelope(...)`
- enforce consistent `request_id`/`bundle_id` locations for correlation extraction

## Single Tool Envelope (`buildToolResultBackendEnvelope`)

Input contract:

- `correlationId` -> mapped to payload `request_id`
- `result` -> success/error/raw data source
- `formattedMessage` -> canonical `llm_content`
- inclusion flags:
  - `includeScreenshot`
  - `includeSystemState`
- optional capture context:
  - `screenshotRef`
  - `systemState`

Output envelope shape:

- `type: "tool-result"`
- `payload`:
  - `request_id`
  - `success`
  - `data` (normalized via `buildToolResultPayloadData`)
  - `error` (forwarded from result)

Normalization dependency (`buildToolResultPayloadData`):

- strips inline binary fields (`screenshot`, `image_data`)
- always injects `llm_content`
- includes `screenshot_ref` and `capture_meta` only when `includeScreenshot` is true
- includes `system_state` only when `includeSystemState` is true
- when `screen_resolution` is present, also emits `system_state_internal` for backend runtime-state hydration while keeping model-facing `system_state` strict

## Bundle Envelope (`buildToolBundleBackendEnvelope`)

Input contract:

- `bundleId`
- `status` (`success | partial_failure | failure`)
- `stepResults`
- `error` (nullable)
- inclusion flags:
  - `includeScreenshot`
  - `includeSystemState`
- optional capture context:
  - `screenshotRef`
  - `captureMeta`
  - `systemState`

Output envelope shape:

- `type: "tool-bundle-result"`
- `payload` always includes:
  - `bundle_id`
  - `status`
  - `step_results`
  - `error` (can be `null`)
- conditional fields:
  - `screenshot_ref` only when include flag is true and ref exists
  - `capture_meta` only when include flag is true and metadata exists
  - `system_state` only when include flag is true and state exists

Important nuance:

- bundle payload always includes `error` key; non-failure paths typically send `error: null`
- `ToolExecutionService.resolveBundleErrorMessage(...)` only emits non-null error text for `failure`, not for `partial_failure`

## Correlation-ID Contract

`ToolResultEnvelope.resolveToolResultEnvelopeCorrelationId(...)` expects:

- `tool-result` -> `payload.request_id`
- `tool-bundle-result` -> `payload.bundle_id`

This is the shared extraction contract used by `useToolRunner` backend-send gating and untracking logic.

## Runtime Send-Side Wiring (`ToolExecutionService`)

Single tool sends:

- `buildToolResultBackendEnvelope(...)`
- include screenshot/system-state flags follow computer-use classification from capture pipeline

Bundle sends:

- `buildToolBundleBackendEnvelope(...)`
- include screenshot/system-state flags follow `bundleHasComputerTool`

This keeps backend payload enrichment deterministic without duplicating shaping logic in the hook layer.

## Test-Backed Invariants

`tests/frontend/ToolExecutionBackendPayload.test.ts` verifies:

- single-tool envelope uses normalized `llm_content`
- screenshot/system-state fields are omitted when flags are false
- screenshot/capture_meta/system_state appear when flags are true
- bundle envelope includes `error: null` in success case and string error in failure case

`tests/frontend/ToolExecutionPayloads.test.ts` verifies:

- `system_state` required-key normalization
- `system_state_internal` screen-resolution preservation
- screenshot-ref and capture-meta inclusion gates

## Drift Hotspots

1. Changing envelope correlation keys (`request_id`/`bundle_id`) breaks untracking and can leak stale tool callbacks.
2. Emitting inline screenshot base64 into backend payloads increases transport size and bypasses artifact lookup paths.
3. Removing `error` key from bundle payloads can break backend schema expectations and typed guards.
4. Diverging include-flag logic between single and bundle paths can create inconsistent runtime state visibility for backend tool preparation.

## Related Docs

- [Tool Execution Service and Hook Runtime Reference](tool_execution_service_and_hook_runtime_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](capture_artifact_upload_and_payload_normalization_reference.md)
- [Tool Execution and Streaming](../../runtime/tool_execution_and_streaming.md)
