---
summary: "Capture and payload reference: user screenshot/system-state capture pathways, SDK/main post-action capture, removed/deleted renderer `ArtifactUploader`/`ToolExecutionPayloads`/formatter helpers, `RuntimeEndpointStore` artifact URL handling behind the artifact app-runtime client, tool payload field filtering, and content-type normalization contracts."
read_when:
  - When changing screenshot/system-state capture timing, display-bounds injection, or local-runtime screenshot data handling.
  - When changing renderer artifact URL base sync, `RuntimeEndpointStore`, `setRuntimeEndpointHttpUrl`, `buildRuntimeArtifactUrl`, `DesktopArtifactRuntimeClient.buildArtifactUrl`, or backend endpoint propagation into artifact display URLs.
  - When changing `tool-result`/`tool-bundle-result` payload shaping (`system_state`, `screenshot_ref`, `output`, `capture_meta`) before backend relay.
  - When searching for removed or deleted renderer capture/upload/formatter helpers such as `ArtifactUploader`, `ToolScreenshotDebugTrace`, `ScreenshotAttachmentPipeline`, `CapturePayloadUtils`, `MessageFormatter`, `ToolExecutionPayloads.ts`, or `ToolExecutionBackendPayload.ts`.
title: "Capture, Artifact URL, and Payload Normalization Reference"
---

# Capture, Artifact URL, and Payload Normalization Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopArtifactRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRuntimeEndpointClient.ts`
- `packages/windie-sdk-js/src/runtime/DefaultTurnResourceResolvers.ts`
- `packages/windie-sdk-js/src/runtime/VisualResourceMaterializer.ts`
- `frontend/src/renderer/infrastructure/services/RuntimeEndpointStore.ts`
- `frontend/src/renderer/infrastructure/services/ArtifactImageUtils.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `packages/windie-sdk-js/cjs/tools/ToolExecutionCoordinator.js`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/RuntimeEndpointStore.test.ts`
- `tests/frontend/ArtifactImageUtils.test.ts`
- `tests/frontend/AgentSdkConversationRuntime.test.ts`
- `tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs`

## Screenshot Invocation and Display-Bounds Injection

SDK/main local-runtime screenshot behavior:

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

- `DesktopChatSendPreparationRuntime` emits a `query_screenshot_request` SDK resource
  when overlay/config policy asks for a query screenshot
- renderer does not capture, upload, or materialize that screenshot before the
  SDK turn exists
- SDK/main resource resolution performs the capture, artifact materialization,
  and backend-compatible `screenshot_ref`/`screenshot_refs`/`capture_meta`
  assembly

System-state behavior:

- optional system-state fields:
  - `active_window`, `mouse_position`, `screen_resolution`
- includes `windows` only when explicitly requested

Failure policy:

- invoke errors are logged
- main/renderer system-state consumers receive `null` instead of throwing
- screenshot visibility restore errors are logged, but active capture events and
  timing cleanup still run so listeners cannot remain stuck in active state

## Artifact Materialization and Runtime URL Composition

Renderer send code does not upload screenshot or attachment artifacts before
dispatching a turn. It submits typed SDK resources; SDK/main owns resource
resolution, screenshot capture, artifact materialization, and backend-bound
artifact refs. The SDK uses the private `VisualResourceMaterializer` helper for
user image attachments, query screenshot data, tool screenshot data, and trusted
main-process screenshot bytes before backend payload assembly.

Electron main remains the only layer that trusts local screenshot temp paths.
It validates ownership, reads the file, deletes the temp file, and passes
trusted bytes to the shared materializer. SDK query resolution accepts artifact
refs or inline screenshot data from the local-runtime bridge; raw
`screenshot_path` values are treated as unmaterialized local temp paths and are
not read, uploaded, deleted, or relayed by SDK query resolution.

`setRuntimeEndpointHttpUrl(...)`:

- accepts only valid `http/https` URLs
- strips query/hash and normalizes trailing slashes
- used by `buildRuntimeArtifactUrl(artifactId)` for canonical `/api/artifacts/<id>` links
- consumed by chat presentation through
  `DesktopArtifactRuntimeClient.buildArtifactUrl(...)` so feature code does not
  import endpoint state directly
- surfaced to app providers and runtime clients through
  `DesktopRuntimeEndpointClient` so config, artifact, and voice paths do not
  import the endpoint store directly

## Content-Type Normalization

`ArtifactImageUtils` normalizes content types used during artifact upload naming:

- any `png` variant -> `image/png` + `.png`
- everything else -> `image/jpeg` + `.jpg`

SDK/main screenshot materialization maps raw screenshot fields into
standardized content types and normalizes `screenshot` / `screenshot_ref` /
`screenshot_url` onto one attachment contract before backend relay.

## Removed/Deleted Renderer Capture and Upload Helpers

The renderer no longer owns screenshot artifact upload, screenshot attachment
materialization, or model-facing tool-result formatting. Removed helper names
such as `ArtifactUploader`, `ToolScreenshotDebugTrace`,
`ScreenshotAttachmentPipeline`, `CapturePayloadUtils`, and renderer
`MessageFormatter` should route to this reference.

Stale searches for deleted renderer helpers such as `ArtifactUploader` renderer
upload, `ToolScreenshotDebugTrace` renderer debug trace,
`ScreenshotAttachmentPipeline`, `CapturePayloadUtils`, or `MessageFormatter`
should land here before historical design docs.

Current ownership:

- SDK/main owns query screenshot resource resolution, post-action screenshot
  capture, shared visual-resource materialization, and backend-bound screenshot
  refs.
- Electron main owns local-runtime screenshot invocation, selected-display bounds
  injection, local screenshot temp-path validation, upload fallback behavior,
  cleanup, and local bridge result normalization.
- Renderer infrastructure owns artifact URL display helpers only
  (`RuntimeEndpointStore` and `ArtifactImageUtils`), while app providers and
  runtime clients reach endpoint state through `DesktopRuntimeEndpointClient`
  and renderer feature code reaches artifact URL construction through
  `DesktopArtifactRuntimeClient.buildArtifactUrl(...)`.
- Renderer chat presentation consumes projected SDK/backend events; it does not
  construct model-facing result payloads or upload screenshot artifacts before
  dispatch.
- Renderer app runtime owns authenticated artifact image fetch, native image
  context-menu IPC calls, and feature-facing artifact URL construction through
  `desktopArtifactRuntimeClient.ts`; message presentation and screenshot
  resolution call that adapter instead of importing artifact IPC channel
  constants or endpoint state directly.

## Removed ToolExecutionPayloads Route

`frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts` and
`ToolExecutionBackendPayload.ts` are no longer current renderer services.
Backend-bound tool result shaping is split across:

- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts` for local tool
  execution, post-action capture, screenshot artifact materialization, and
  `tool-result`/`tool-bundle-result` envelopes
- `packages/windie-sdk-js/src/transport/backendPayloadContract.ts` for
  backend-bound payload field filtering and capture metadata normalization
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs` for
  Electron main local execution and result normalization

Current payload cleanup rules:

- raw screenshot data is materialized to artifact refs where possible before
  backend relay
- `capture_meta` is preserved when it is object-shaped
- `system_state_internal` remains separate from public `system_state`
- single-tool results use `type: "tool-result"`
- bundle results use `type: "tool-bundle-result"` with per-step outputs and
  top-level screenshot/capture metadata when available

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

Correlation contract is inherited from the SDK result envelope:

- single tool -> `payload.request_id`
- bundle -> `payload.bundle_id`

## Tool Output Text Contracts

SDK/main result envelopes preserve tool text in the canonical `output` field
before backend relay:

- single tool results normalize `data.output` from the local-runtime/native result
- bundle results preserve each step's output and top-level screenshot metadata
- backend history stores the normalized result payload instead of relying on a
  renderer formatter layer

## Test-Backed Invariants

`tests/frontend/ChatMessageSender.test.tsx` verifies:

- query screenshot requests are sent as SDK resources, not renderer captures

`tests/frontend/AgentSdkConversationRuntime.test.ts` and `tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs` verify:

- envelope type + payload key contracts for single-tool and bundle sends
- single computer-use tools merge one post-action screenshot into tool result data
- bundled computer-use execution captures once after all steps
- explicit bundle screenshot steps are promoted instead of duplicated

`tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs` verifies:

- Electron main local-runtime bridge prepares the desktop surface before computer-use local execution

`tests/frontend/RuntimeEndpointStore.test.ts` and `ArtifactImageUtils.test.ts` verify:

- runtime URL normalization and artifact URL composition
- content-type/extension normalization defaults

## Drift Hotspots

1. Passing raw `screenshot`/`image_data` through to backend can inflate payloads and break contract assumptions.
2. Removing `Unknown` fallback normalization for system-state keys can break backend schema expectations.
3. Reintroducing renderer-side query screenshot capture can duplicate SDK/main resource ownership.
4. Dropping `screen_resolution` internal propagation can silently degrade backend coordinate normalization on HiDPI displays.
