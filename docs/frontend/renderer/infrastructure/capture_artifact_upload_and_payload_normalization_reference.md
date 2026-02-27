---
summary: "Renderer capture and payload reference: screenshot/system-state capture pathways, artifact upload URL handling, tool payload field filtering, and content-type normalization contracts."
read_when:
  - When changing screenshot/system-state capture timing, display-bounds injection, or sidecar screenshot data handling.
  - When changing `tool-result`/`tool-bundle-result` payload shaping (`system_state`, `screenshot_ref`, `llm_content`) before backend relay.
title: "Capture, Artifact Upload, and Payload Normalization Reference"
---

# Capture, Artifact Upload, and Payload Normalization Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/services/SystemCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionInvoker.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactUploader.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `frontend/src/renderer/infrastructure/services/MessageFormatter.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionLogger.ts`
- `tests/frontend/SystemCapture.test.ts`
- `tests/frontend/ToolExecutionCapture.test.ts`
- `tests/frontend/ToolExecutionPayloads.test.ts`
- `tests/frontend/ArtifactUploader.test.ts`
- `tests/frontend/ArtifactImageUtils.test.ts`
- `tests/frontend/ToolExecutionInvoker.test.ts`
- `tests/frontend/ToolExecutionLogger.test.ts`

## Screenshot Invocation and Display-Bounds Injection

`ToolExecutionInvoker.invokeTool(...)` behavior:

- for `screenshot` tool:
  - args normalized to object
  - selected display bounds from local storage injected as `display_bounds` when present
- non-screenshot tools pass args unchanged
- returns both tool result and precise IPC invoke duration

This ensures screenshot capture respects the user-selected display in multi-monitor setups.

## Capture Policy (`ToolExecutionCapture`)

`isComputerUseTool(...)` returns true for:

- known computer-use tools (`mouse_control`, `keyboard_control`, `scroll_control`, `screenshot`, `wait`, `switch_tab`)
- `run_shell_command` when `wait > 0`

`ensureAutoCapture(...)` rules:

- if result already contains screenshot data (`screenshot` or `image_data`), no new capture runs
- otherwise auto-captures when:
  - not `skipAutoCapture`
  - and tool is computer-use or explicit `screenshot`
- capture writes screenshot/system-state/content-type back into tool result object for downstream formatting/payload paths

Wait-delay resolution:

- explicit `wait.seconds` for `wait` tool
- otherwise `args.wait` if present
- fallback defaults:
  - screenshot tool: `0`
  - other computer-use tools: `2`

## System Capture Execution Paths (`extractOSstate`)

Shared behavior:

- optional wait (seconds -> milliseconds) before capture
- pre-capture focus handoff via `prepare-overlay-tool-focus` (default `waitMs:120`) so active-window/system-state sampling prefers the external target window instead of overlay surfaces
- wraps screenshot activity in window event markers:
  - `windie:screenshot-capture {active:true|false}`

First user message mode (`is_first_user_message=true`):

- optionally queries richer system-state fields:
  - `active_window`, `mouse_position`, `screen_resolution`, `windows`
- optional screenshot call uses explanation:
  - `Initial user message screenshot`

Regular mode:

- optional system-state fields:
  - `active_window`, `mouse_position`, `screen_resolution`
- optional screenshot explanation:
  - `Screenshot capture`
- executes enabled system-state + screenshot requests in parallel

Failure policy:

- invoke errors are logged
- returns `{systemState:null,screenshot:null,screenshotContentType:null}` instead of throwing

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

`SystemCapture` also maps raw screenshot format/compression fields into standardized content types.

## Backend Payload Normalization (`ToolExecutionPayloads`)

`buildToolResultPayloadData(...)` does the core backend-bound cleanup:

- strips inline binary/raw fields:
  - `screenshot`, `image_data`
- strips inbound transport fields before rebuild:
  - `screenshot_ref`, `system_state`
- always injects canonical `llm_content` (formatted tool output)

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

## Message Formatter Contracts

`formatToolOutputMessage(...)` and `formatBundledToolOutputMessage(...)`:

- include textual output extraction fallback ordering
- append status lines (`successful` / `failed`)
- append lightweight XML system context block when enabled
- append screen-state hint line when screenshot data is present

Output string from formatter is the source of truth written into `llm_content`.

## Logging Gate

`ToolExecutionLogger` info logs are gated by:

- default off in test mode
- force-on via `window.__WINDIE_VERBOSE_TOOL_LOGS__ = true`

Error logs still emit through `console.error`.

## Test-Backed Invariants

`tests/frontend/SystemCapture.test.ts` verifies:

- first-message vs regular capture field sets
- wait delays, display-bounds propagation, and graceful error fallback
- screenshot content-type extraction and non-string screenshot handling

`tests/frontend/ToolExecutionCapture.test.ts` verifies:

- computer-tool detection and wait-resolution logic
- capture reuse when screenshot already present
- skip-auto-capture behavior
- result data backfill with captured screenshot/system-state

`tests/frontend/ToolExecutionPayloads.test.ts` verifies:

- raw screenshot field stripping
- screenshot_ref inclusion gates
- required system-state fallback values
- internal-only `screen_resolution` preservation behavior

`tests/frontend/ArtifactUploader.test.ts` and `ArtifactImageUtils.test.ts` verify:

- upload success/failure mapping behavior
- backend URL normalization and artifact URL composition
- content-type/extension normalization defaults

## Drift Hotspots

1. Passing raw `screenshot`/`image_data` through to backend can inflate payloads and break contract assumptions.
2. Removing `Unknown` fallback normalization for system-state keys can break backend schema expectations.
3. Changing first-message capture field set may remove context required by downstream summarization and transparency UI.
4. Dropping `screen_resolution` internal propagation can silently degrade backend coordinate normalization on HiDPI displays.
