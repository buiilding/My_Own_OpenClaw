---
summary: "Capture and payload reference: user screenshot/system-state capture pathways, SDK/main post-action capture, artifact upload URL handling, tool payload field filtering, and content-type normalization contracts."
read_when:
  - When changing screenshot/system-state capture timing, display-bounds injection, or sidecar screenshot data handling.
  - When changing `tool-result`/`tool-bundle-result` payload shaping (`system_state`, `screenshot_ref`, `output`) before backend relay.
title: "Capture, Artifact Upload, and Payload Normalization Reference"
---

# Capture, Artifact Upload, and Payload Normalization Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/ScreenshotAttachmentPipeline.ts`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/cjs/tools/ToolExecutionCoordinator.js`
- `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`
- `tests/frontend/ScreenshotAttachmentPipeline.test.ts`
- `tests/frontend/SystemStateCapture.test.ts`
- `tests/frontend/ArtifactUploader.test.ts`
- `tests/frontend/ArtifactImageUtils.test.ts`
- `tests/frontend/ToolExecutionLogger.test.ts`
- `tests/frontend/WindieSdkDesktopAgent.test.ts`
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

## Screenshot and System-State Capture Execution Paths

Shared behavior:

- optional wait (seconds -> milliseconds) before capture
- wraps screenshot activity in window event markers:
  - `windie:screenshot-capture {active:true|false, activeCount}`
  - overlapping captures emit `active:false` only after the last capture has restored visibility

`captureScreenshotAttachment(...)`:

- optional screenshot call uses explanation:
  - `Initial user message screenshot`
- injects stored `display_bounds` when present
- preserves inline screenshot fallback when artifact upload is unavailable

`captureSystemState(...)`:

- optional system-state fields:
  - `active_window`, `mouse_position`, `screen_resolution`
- includes `windows` only when explicitly requested

Failure policy:

- invoke errors are logged
- returns `null`/empty attachment instead of throwing
- screenshot visibility restore errors are logged, but active capture events and
  timing cleanup still run so listeners cannot remain stuck in active state

## Artifact Upload and Runtime URL Composition

`uploadArtifactBase64(...)`:

- no-op returns `null` for empty base64 input
- sends IPC invoke `upload-artifact` with `{base64, contentType, filename}`
- maps success response to normalized artifact shape
- failed/missing-data responses return `null` with warning

`setBackendHttpUrl(...)`:

- accepts only valid `http/https` URLs
- strips query/hash and normalizes trailing slashes
- used by `buildArtifactUrl(artifactId)` for canonical `/api/artifacts/<id>` links

## Content-Type Normalization

`ArtifactImageUtils` normalizes content types used during artifact upload naming:

- any `png` variant -> `image/png` + `.png`
- everything else -> `image/jpeg` + `.jpg`

`ScreenshotAttachmentPipeline` also maps raw screenshot format/compression fields into standardized content types and normalizes `screenshot` / `screenshot_ref` / `screenshot_url` onto one attachment contract.

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

## Message Formatter Contracts

`formatToolOutputMessage(...)` and `formatBundledToolOutputMessage(...)`:

- include textual output extraction fallback ordering
- append status lines (`successful` / `failed`)
- append lightweight XML system context block when enabled
- append screen-state hint line when screenshot data is present

Output string from formatter is the source of truth written into `output`.

## Logging Gate

`ToolExecutionLogger` info logs are gated by:

- default off in test mode
- force-on via `window.__WINDIE_VERBOSE_TOOL_LOGS__ = true`

Error logs still emit through `console.error`.

## Test-Backed Invariants

`tests/frontend/ScreenshotAttachmentPipeline.test.ts` and `tests/frontend/SystemStateCapture.test.ts` verify:

- wait delays, display-bounds propagation, and graceful error fallback
- screenshot content-type extraction, artifact upload fallback, and screenshot-ref/url normalization
- default versus `includeWindows` system-state field selection

`tests/frontend/WindieSdkDesktopAgent.test.ts` verifies:

- envelope type + payload key contracts for single-tool and bundle sends
- single computer-use tools merge one post-action screenshot into tool result data
- bundled computer-use execution captures once after all steps
- explicit bundle screenshot steps are promoted instead of duplicated

`tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs` verifies:

- main runtime prepares the desktop surface before computer-use sidecar execution

`tests/frontend/ArtifactUploader.test.ts` and `ArtifactImageUtils.test.ts` verify:

- upload success/failure mapping behavior
- backend URL normalization and artifact URL composition
- content-type/extension normalization defaults

## Drift Hotspots

1. Passing raw `screenshot`/`image_data` through to backend can inflate payloads and break contract assumptions.
2. Removing `Unknown` fallback normalization for system-state keys can break backend schema expectations.
3. Changing first-message capture field set may remove context required by downstream summarization and transparency UI.
4. Dropping `screen_resolution` internal propagation can silently degrade backend coordinate normalization on HiDPI displays.
