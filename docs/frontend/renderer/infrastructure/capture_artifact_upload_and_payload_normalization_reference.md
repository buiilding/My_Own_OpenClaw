---
summary: "Capture and payload reference: user screenshot/system-state capture pathways, SDK/main post-action capture, artifact URL handling, tool payload field filtering, and content-type normalization contracts."
read_when:
  - When changing screenshot/system-state capture timing, display-bounds injection, or sidecar screenshot data handling.
  - When changing `tool-result`/`tool-bundle-result` payload shaping (`system_state`, `screenshot_ref`, `output`) before backend relay.
title: "Capture, Artifact Upload, and Payload Normalization Reference"
---

# Capture, Artifact Upload, and Payload Normalization Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/renderer/infrastructure/services/BackendEndpointStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/cjs/tools/ToolExecutionCoordinator.js`
- `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_screenshot_attachment.cjs`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/SystemStateCapture.test.ts`
- `tests/frontend/BackendEndpointStore.test.ts`
- `tests/frontend/ArtifactImageUtils.test.ts`
- `tests/frontend/ToolExecutionLogger.test.ts`
- `tests/frontend/WindieSdkConversationRuntime.test.ts`
- `tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs`

## Screenshot Invocation and Display-Bounds Injection

Main/sidecar screenshot behavior:

- for `screenshot` tool:
  - args normalized to object
  - selected display bounds from local storage injected as `display_bounds` when present
- non-screenshot tools pass args unchanged

This ensures screenshot capture respects the user-selected display in multi-monitor setups.

## SDK Post-Action Capture Policy

`ToolExecutionCoordinator` owns post-action screenshot policy for local tool execution.

Capture-worthy tools:

- known computer-use tools (`mouse_control`, `keyboard_control`, `scroll_control`, `wait`, `switch_window`, plus `click`, `type`, `scroll`)
- `run_shell_command` when `wait > 0`

Rules:

- explicit `screenshot` tools return their own screenshot result
- single capture-worthy tools merge one post-action screenshot into the `tool-result` data
- atomic bundles execute every step first and then capture once at bundle level
- bundles with an explicit successful `screenshot` step promote that screenshot to the top-level bundle result instead of taking a duplicate capture
- no capture runs when the original result already contains screenshot data

Wait-delay resolution:

- explicit `wait.seconds` for `wait` tool
- otherwise `args.wait` if present
- fallback default: `2s`
- bundle capture waits once, using the maximum resolved wait among successful capture-worthy steps

## Query Screenshot and System-State Capture Execution Paths

Renderer send behavior:

- `desktopChatSendPreparation.ts` emits a `query_screenshot_request` SDK resource
  when overlay/config policy asks for a query screenshot
- renderer does not capture, upload, or materialize that screenshot before the
  SDK turn exists
- SDK/main resource resolution performs the capture, artifact materialization,
  and backend-compatible `screenshot_ref`/`screenshot_refs`/`capture_meta`
  assembly

System-state behavior:

- optional wait (seconds -> milliseconds) before capture
- prepares external focus before invoking main for system state

`captureSystemState(...)`:

- optional system-state fields:
  - `active_window`, `mouse_position`, `screen_resolution`
- includes `windows` only when explicitly requested

Failure policy:

- invoke errors are logged
- renderer system-state capture returns `null` instead of throwing
- screenshot visibility restore errors are logged, but active capture events and
  timing cleanup still run so listeners cannot remain stuck in active state

## Artifact Materialization and Runtime URL Composition

Renderer send code does not upload screenshot or attachment artifacts before
dispatching a turn. It submits typed SDK resources; SDK/main owns resource
resolution, screenshot capture, artifact materialization, and backend-bound
artifact refs.

`setBackendHttpUrl(...)`:

- accepts only valid `http/https` URLs
- strips query/hash and normalizes trailing slashes
- used by `buildArtifactUrl(artifactId)` for canonical `/api/artifacts/<id>` links

## Content-Type Normalization

`ArtifactImageUtils` normalizes content types used during artifact upload naming:

- any `png` variant -> `image/png` + `.png`
- everything else -> `image/jpeg` + `.jpg`

SDK/main screenshot materialization maps raw screenshot format/compression fields into standardized content types and normalizes `screenshot` / `screenshot_ref` / `screenshot_url` onto one attachment contract before backend relay.

## Backend Payload Normalization (`ToolExecutionPayloads`)

`buildToolResultPayloadData(...)` does the core backend-bound cleanup:

- strips inline binary/raw fields:
  - `screenshot`, `image_data`
- strips inbound transport fields before rebuild:
  - `screenshot_ref`, `system_state`
- always injects canonical `output` (formatted tool output)

Optional inclusion gates:

- `includeScreenshot` + resolved screenshot ref -> includes `screenshot_ref`
- `includeSystemState` -> includes normalized required state:
  - `active_window`
  - `mouse_position`
  - missing values default to `Unknown`

Internal extension field:

- when available, `screen_resolution` is preserved only in `system_state_internal`
- this keeps backend coordinate normalization data without widening public `system_state` contract

## Bundle Result Normalization Helpers

Bundle helpers standardize UI/backend interchange:

- `normalizeBundleStepResults(...)`: maps step rows into tool-like normalized result objects
- `toBundleExecutionResults(...)`: maps normalized rows to bundled UI result shape
- `resolveBundleStatus(...)`: derives `success`/`partial_failure`/`failure`
- `resolveBundleErrorMessage(...)`: only emits error for `failure`

## SDK/Main Result Envelope Layer

`ToolExecutionCoordinator` is the final send-side wrapper used by the SDK tool router/result relay:

- single-tool:
  - normalizes `data`
  - merges SDK-owned post-action screenshot fields when applicable
  - wraps payload in `type: "tool-result"`
- bundle:
  - builds `type: "tool-bundle-result"`
  - always includes `error` key (nullable)
  - includes top-level `screenshot_ref`/`capture_meta` when available from an explicit or post-action screenshot

Correlation contract is inherited from `ToolResultEnvelope`:

- single tool -> `payload.request_id`
- bundle -> `payload.bundle_id`

## Tool Output Text Contracts

SDK/main result envelopes preserve tool text in the canonical `output` field
before backend relay:

- single tool results normalize `data.output` from the sidecar/native result
- bundle results preserve each step's output and top-level screenshot metadata
- backend history stores the normalized result payload instead of relying on a
  renderer formatter layer

## Logging Gate

`ToolExecutionLogger` info logs are gated by:

- default off in test mode
- force-on via `window.__WINDIE_VERBOSE_TOOL_LOGS__ = true`

Error logs still emit through `console.error`.

## Test-Backed Invariants

`tests/frontend/ChatMessageSender.test.tsx` and `tests/frontend/SystemStateCapture.test.ts` verify:

- query screenshot requests are sent as SDK resources, not renderer captures
- wait delays and graceful system-state error fallback
- default versus `includeWindows` system-state field selection

`tests/frontend/WindieSdkConversationRuntime.test.ts` and `tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs` verify:

- envelope type + payload key contracts for single-tool and bundle sends
- single computer-use tools merge one post-action screenshot into tool result data
- bundled computer-use execution captures once after all steps
- explicit bundle screenshot steps are promoted instead of duplicated

`tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs` verifies:

- main runtime prepares the desktop surface before computer-use sidecar execution

`tests/frontend/BackendEndpointStore.test.ts` and `ArtifactImageUtils.test.ts` verify:

- backend URL normalization and artifact URL composition
- content-type/extension normalization defaults

## Drift Hotspots

1. Passing raw `screenshot`/`image_data` through to backend can inflate payloads and break contract assumptions.
2. Removing `Unknown` fallback normalization for system-state keys can break backend schema expectations.
3. Reintroducing renderer-side query screenshot capture can duplicate SDK/main resource ownership.
4. Dropping `screen_resolution` internal propagation can silently degrade backend coordinate normalization on HiDPI displays.
